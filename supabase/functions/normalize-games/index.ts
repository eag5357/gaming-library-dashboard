import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, getAuthContext, getSupabaseClient } from "../_shared/cors.ts";

export function sanitizeTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") 
    .replace(/\b(Enhanced Edition|GOTY|Game of the Year|Remastered|Definitive Edition|Friend's Pass|Platinum|Legacy|Edition|Demo|Launcher|Bundle|Pack)\b/gi, "")
    .replace(/[^a-zA-Z0-9]/g, " ") 
    .replace(/\s+/g, " ") 
    .trim();
}

async function performNormalization() {
  const TWITCH_CLIENT_ID = Deno.env.get("TWITCH_CLIENT_ID") ?? "";
  const TWITCH_CLIENT_SECRET = Deno.env.get("TWITCH_CLIENT_SECRET") ?? "";

  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    throw new Error("Twitch credentials missing");
  }

  const supabase = getSupabaseClient();


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
    .limit(500); 

  if (fetchError) throw fetchError;
  if (!unlinkedGames || unlinkedGames.length === 0) return { message: "No games left to normalize." };

  let normalizedCount = 0;
  for (const pg of unlinkedGames) {
    let title = pg.raw_metadata?.name || pg.raw_metadata?.trophyTitleName || pg.raw_metadata?.trophyTitleDetail;
    if (!title) continue;

    const MANUAL_MAPPINGS: Record<string, { id: number, display?: string }> = {
      "God of War Ragnarök": { id: 112875, display: "God of War: Ragnarok" },
      "Red Dead Redemption": { id: 434 },
      "RED DEAD REDEMPTION": { id: 434, display: "Red Dead Redemption" },
      "Tomb Raider I-III Remastered Starring Lara Croft": { id: 266683 },
      "Resident Evil 2": { id: 19686 },
      "Resident Evil 4": { id: 145191 },
      "Resident Evil 4 (2005)": { id: 974 },
      "Resident Evil Village": { id: 55163 },
      "RESIDENT EVIL 7 biohazard": { id: 19562 },
      "X-COM: Terror from the Deep": { id: 1040, display: "X-COM: Terror from the Deep" },
      "X-COM: Apocalypse": { id: 1041, display: "X-COM: Apocalypse" },
      "X-COM: Interceptor": { id: 1042, display: "X-COM: Interceptor" },
      "X-COM: UFO Defense": { id: 1039, display: "X-COM: UFO Defense" },
      "X-COM: Enforcer": { id: 1043, display: "X-COM: Enforcer" },
      "Grand Theft Auto Online (Xbox Series X|S)": { id: 11624, display: "Grand Theft Auto Online" },
      "DOOM Eternal (BATTLEMODE)": { id: 102606, display: "DOOM Eternal" }
    };

    // Blacklist utilities/meta-apps
    if (["Megapicker", "Launcher", "Demo", "Soundtrack", "Artbook", "Lossless Scaling"].some(word => title.includes(word))) continue;

    const providerGameId = pg.raw_metadata?.titleId || pg.raw_metadata?.applicationId;
    if (providerGameId === "01007820196A6000") {
      title = "Red Dead Redemption";
    }

    let match: any = null;
    let preferredDisplay = "";

    if (MANUAL_MAPPINGS[title]) {
      const mapping = MANUAL_MAPPINGS[title];
      console.log(`Using manual mapping for "${title}" -> ID ${mapping.id}`);
      const manualRes = await fetch("https://api.igdb.com/v4/games", {
        method: "POST",
        headers: { "Client-ID": TWITCH_CLIENT_ID, "Authorization": `Bearer ${IGDB_ACCESS_TOKEN}` },
        body: `fields name, cover.url, id; where id = ${mapping.id};`,
      });
      const manualData = await manualRes.json();
      if (manualData && manualData[0]) {
        match = manualData[0];
        preferredDisplay = mapping.display || match.name;
      }
    }

    if (!match) {
      const sanitizedTitle = sanitizeTitle(title);
      const stripAll = (str: string) => str.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      const strippedSanitized = stripAll(sanitizedTitle);

      console.log(`Normalizing: "${title}" -> Search term: "${sanitizedTitle}"`);
      await new Promise(resolve => setTimeout(resolve, 500));

      const igdbRes = await fetch("https://api.igdb.com/v4/games", {
        method: "POST",
        headers: { "Client-ID": TWITCH_CLIENT_ID, "Authorization": `Bearer ${IGDB_ACCESS_TOKEN}` },
        body: `search "${sanitizedTitle}"; fields name, cover.url, id, version_parent; limit 20;`,
      });
      const igdbData = await igdbRes.json();
      
      if (Array.isArray(igdbData) && igdbData.length > 0) {
        match = igdbData.find(m => m.name && m.name.toLowerCase() === sanitizedTitle.toLowerCase()) ||
                igdbData.find(m => m.name && stripAll(m.name) === strippedSanitized) ||
                igdbData[0];
        preferredDisplay = match.name;
      }
    }

    if (match && match.id) {
      const coverUrl = match.cover?.url ? `https:${match.cover.url.replace("t_thumb", "t_cover_big")}` : null;
      const { data: unifiedGame } = await supabase
        .from("games")
        .upsert({ 
          igdb_id: match.id, 
          display_title: preferredDisplay, 
          normalized_title: preferredDisplay.toLowerCase().trim(), 
          cover_image_url: coverUrl 
        }, { onConflict: "igdb_id" })
        .select("id").single();

      if (unifiedGame) {
        await supabase.from("platform_games").update({ game_id: unifiedGame.id }).eq("id", pg.id);
        normalizedCount++;
      }
    }
  }
  return { success: true, count: normalizedCount };
}

if (import.meta.main) {
  if (Deno.args.includes("--sync")) {
    const result = await performNormalization();
    console.log("Normalization finished:", result);
    Deno.exit(0);
  }

  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    const authContext = await getAuthContext(req);
    if (!authContext || !authContext.isServiceRole) {
      return new Response(JSON.stringify({ error: "Unauthorized. This action requires service role permissions." }), { 
        status: 401, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    try {
      const result = await performNormalization();
      return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (error: any) {

      console.error("Normalization error:", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
  });
}
