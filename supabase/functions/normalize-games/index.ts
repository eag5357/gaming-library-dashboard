import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const TWITCH_CLIENT_ID = Deno.env.get("TWITCH_CLIENT_ID") ?? "";
  const TWITCH_CLIENT_SECRET = Deno.env.get("TWITCH_CLIENT_SECRET") ?? "";
  const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace("http://kong:", "http://127.0.0.1:");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    return new Response(JSON.stringify({ error: "Twitch credentials missing" }), { status: 500 });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Get IGDB Access Token
    const authRes = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
      { method: "POST" }
    );
    const authData = await authRes.json();
    const IGDB_ACCESS_TOKEN = authData.access_token;

    // 2. Fetch platform_games that don't have a game_id (un-normalized)
    const { data: unlinkedGames, error: fetchError } = await supabase
      .from("platform_games")
      .select("id, raw_metadata")
      .is("game_id", null)
      .limit(100); 

    if (fetchError) throw fetchError;
    if (!unlinkedGames || unlinkedGames.length === 0) {
      return new Response(JSON.stringify({ message: "No games left to normalize." }), { status: 200 });
    }

    let normalizedCount = 0;

    // 3. Process each game
    for (const pg of unlinkedGames) {
      let title = pg.raw_metadata?.name || pg.raw_metadata?.trophyTitleName || pg.raw_metadata?.trophyTitleDetail;
      if (!title) {
        console.warn(`Could not find title for platform_game ${pg.id}`, pg.raw_metadata);
        continue;
      }

      const MANUAL_MAPPINGS: Record<string, number> = {
        "Tomb Raider I-III Remastered Starring Lara Croft": 266683,
        "The Jackbox Megapicker": 0,
        "Resident Evil 2": 19686,
        "Resident Evil 4": 145191,
        "Resident Evil 4 (2005)": 974,
        "Resident Evil Village": 55163,
        "RESIDENT EVIL 7 biohazard": 19562,
        "RESIDENT EVIL 7 biohazard Gold Edition": 19562
      };

      if (MANUAL_MAPPINGS[title] === 0) continue;

      // Blacklist utilities/meta-apps
      if (["Megapicker", "Launcher", "Demo", "Soundtrack", "Artbook"].some(word => title.includes(word))) {
        console.log(`Skipping utility/non-game: ${title}`);
        continue;
      }

      // Sanitization: Remove noise that breaks strict IGDB search
      const sanitizedTitle = title
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Strip diacritics
        .replace(/Enhanced Edition|GOTY|Game of the Year|Remastered|Definitive Edition|Friend's Pass|Platinum|Legacy|Edition|Demo|Launcher|Bundle|Pack/gi, "")
        .replace(/[^a-zA-Z0-9]/g, " ") // Replace ANY non-alphanumeric with a space
        .replace(/\s+/g, " ") // Collapse multiple spaces
        .trim();

      const stripAll = (str: string) => str.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      const strippedSanitized = stripAll(sanitizedTitle);

      console.log(`Normalizing: "${title}" -> Search term: "${sanitizedTitle}"`);

      // Small delay to stay under IGDB rate limit (4 req/sec)
      await new Promise(resolve => setTimeout(resolve, 300));

      let match: any = null;

      // 0. Check Manual Mappings
      if (MANUAL_MAPPINGS[title]) {
        console.log(`Using manual mapping for "${title}" -> ID ${MANUAL_MAPPINGS[title]}`);
        const manualRes = await fetch("https://api.igdb.com/v4/games", {
          method: "POST",
          headers: {
            "Client-ID": TWITCH_CLIENT_ID,
            "Authorization": `Bearer ${IGDB_ACCESS_TOKEN}`,
          },
          body: `fields name, cover.url, id; where id = ${MANUAL_MAPPINGS[title]};`,
        });
        const manualData = await manualRes.json();
        if (manualData && manualData[0]) match = manualData[0];
      }

      if (!match) {
        // Search IGDB - fetch top results with a more flexible query
        const igdbRes = await fetch("https://api.igdb.com/v4/games", {
          method: "POST",
          headers: {
            "Client-ID": TWITCH_CLIENT_ID,
            "Authorization": `Bearer ${IGDB_ACCESS_TOKEN}`,
          },
          body: `search "${sanitizedTitle}"; fields name, cover.url, id, version_parent; limit 20;`,
        });

        const igdbData = await igdbRes.json();
        
        if (Array.isArray(igdbData) && igdbData.length > 0) {
          // IMPROVED MATCH LOGIC:
          // 1. Exact match (case insensitive)
          match = igdbData.find(m => m.name && m.name.toLowerCase() === sanitizedTitle.toLowerCase());

          // 2. Match on stripped alphanumeric
          if (!match) {
            match = igdbData.find(m => m.name && stripAll(m.name) === strippedSanitized);
          }

          // 3. Exact match on stripped diacritics
          if (!match) {
            const stripDiacritics = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
            match = igdbData.find(m => m.name && stripDiacritics(m.name) === stripDiacritics(sanitizedTitle));
          }

          // 4. Match where IGDB name is fully contained in our sanitized title
          if (!match) {
            match = igdbData
              .filter(m => m.name && strippedSanitized.includes(stripAll(m.name)))
              .sort((a, b) => b.name.length - a.name.length)[0];
          }

          // 5. Fallback: Shortest name that contains our search term
          if (!match) {
            match = igdbData
              .filter(m => m.name && m.name.toLowerCase().includes(sanitizedTitle.toLowerCase()))
              .sort((a, b) => a.name.length - b.name.length)[0];
          }

          // 6. Last Resort Fallback
          if (!match) {
            match = igdbData[0];
          }
        }
      }

      // Follow version_parent if available to get to the base game
      if (match && match.version_parent) {
         console.log(`Matching "${title}" to version parent ID: ${match.version_parent}`);
         const parentRes = await fetch("https://api.igdb.com/v4/games", {
            method: "POST",
            headers: {
              "Client-ID": TWITCH_CLIENT_ID,
              "Authorization": `Bearer ${IGDB_ACCESS_TOKEN}`,
            },
            body: `fields name, cover.url, id; where id = ${match.version_parent};`,
          });
          const parentData = await parentRes.json();
          if (parentData && parentData[0]) {
            match = parentData[0];
          }
      }

      if (match && match.name && match.id) {
        console.log(`Matched "${title}" to IGDB: "${match.name}" (ID: ${match.id})`);
        
        const coverUrl = match.cover?.url ? `https:${match.cover.url.replace("t_thumb", "t_cover_big")}` : null;

        // Upsert into unified 'games' table
        const { data: unifiedGame, error: upsertError } = await supabase
          .from("games")
          .upsert({
            igdb_id: match.id,
            display_title: match.name,
            normalized_title: match.name.toLowerCase().trim(),
            cover_image_url: coverUrl
          }, { onConflict: "igdb_id" })
          .select("id")
          .single();

        if (upsertError) {
          console.error(`Error upserting game ${match.name}:`, upsertError);
          continue;
        }

        // Link the platform_game to the unified game
        await supabase
          .from("platform_games")
          .update({ game_id: unifiedGame.id })
          .eq("id", pg.id);

        normalizedCount++;
      } else {
        console.warn(`No valid IGDB match found for: ${sanitizedTitle}`);
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: `Normalized ${normalizedCount} games.` }),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    console.error("Normalization error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
