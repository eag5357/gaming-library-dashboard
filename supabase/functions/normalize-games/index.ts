import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const TWITCH_CLIENT_ID = Deno.env.get("TWITCH_CLIENT_ID") ?? "";
  const TWITCH_CLIENT_SECRET = Deno.env.get("TWITCH_CLIENT_SECRET") ?? "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    return new Response(JSON.stringify({ error: "Twitch credentials missing" }), { status: 500 });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Get Twitch Access Token
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
      .limit(50); 

    if (fetchError) throw fetchError;
    if (!unlinkedGames || unlinkedGames.length === 0) {
      return new Response(JSON.stringify({ message: "No games left to normalize." }), { status: 200 });
    }

    let normalizedCount = 0;

    // 3. Process each game
    for (const pg of unlinkedGames) {
      let title = pg.raw_metadata?.name;
      if (!title) continue;

      // Sanitization: Remove noise that breaks strict IGDB search
      const sanitizedTitle = title
        .replace(/[:™®©]/g, "") 
        .replace(/\(.*\)/g, "") 
        .replace(/Enhanced Edition|GOTY|Game of the Year|Remastered|Definitive Edition|Friend's Pass|Platinum/gi, "")
        .trim();

      console.log(`Normalizing: "${title}" -> Search term: "${sanitizedTitle}"`);

      // Small delay to stay under IGDB rate limit (4 req/sec)
      await new Promise(resolve => setTimeout(resolve, 300));

      // Search IGDB - fetch top 5 to find the best match
      const igdbRes = await fetch("https://api.igdb.com/v4/games", {
        method: "POST",
        headers: {
          "Client-ID": TWITCH_CLIENT_ID,
          "Authorization": `Bearer ${IGDB_ACCESS_TOKEN}`,
        },
        body: `search "${sanitizedTitle}"; fields name, cover.url, id; limit 5;`,
      });

      const igdbData = await igdbRes.json();
      
      if (!Array.isArray(igdbData) || igdbData.length === 0) {
        console.warn(`No IGDB match found for: ${sanitizedTitle}`);
        continue;
      }

      // "Best Match" Logic:
      // 1. Try to find an exact case-insensitive match first.
      // 2. If multiple matches, prefer the one with the shortest name (usually the base game).
      let match = igdbData.find(m => m.name.toLowerCase() === sanitizedTitle.toLowerCase());
      
      if (!match) {
        // Fallback: Find the shortest name that contains our search term
        match = igdbData
          .filter(m => m.name.toLowerCase().includes(sanitizedTitle.toLowerCase()))
          .sort((a, b) => a.name.length - b.name.length)[0];
      }

      // If still no specific match, default to the first search result
      if (!match) match = igdbData[0];

      if (match) {
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
          console.error(`Error upserting unified game ${match.name}:`, upsertError);
          continue;
        }

        // Link platform_game back to unified game
        await supabase
          .from("platform_games")
          .update({ game_id: unifiedGame.id })
          .eq("id", pg.id);

        normalizedCount++;
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
