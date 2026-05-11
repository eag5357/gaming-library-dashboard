import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function performXboxSync() {
  const OPENXBL_API_KEY = Deno.env.get("OPENXBL_API_KEY") ?? "";
  const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace("http://kong:", "http://127.0.0.1:");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!OPENXBL_API_KEY) {
    throw new Error("OPENXBL_API_KEY missing");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  console.log("Starting Xbox sync...");

  const { data: accounts, error: accountsError } = await supabase
    .from("linked_accounts")
    .select("*")
    .eq("platform_name", "XBOX");

  if (accountsError) throw accountsError;
  
  let totalSynced = 0;
  for (const account of accounts) {
    const targetXuid = account.provider_account_id;
    console.log(`Syncing Xbox library for XUID: ${targetXuid}`);
    const titleHistoryRes = await fetch(`https://api.xbl.io/v2/player/titleHistory/${targetXuid}`, {
      headers: { 
        "X-Authorization": OPENXBL_API_KEY, 
        "Accept": "application/json",
        "Accept-Language": "en-US"
      }
    });
    const historyData = await titleHistoryRes.json();
    let content = historyData.content;
    if (typeof content === "string") {
      try {
        content = JSON.parse(content);
      } catch (e) {
        console.error("Failed to parse content string:", e);
      }
    }
    
    const titles = content?.titles || historyData.titles || (Array.isArray(content) ? content : []);
    console.log(`Extracted ${titles.length} titles.`);

    for (const title of titles) {
      const providerId = title.titleId?.toString();
      if (!providerId) continue;

      let minutesPlayed = 0;

      // Primary source: achievements/stats endpoint (most reliable for playtime)
      try {
        const statsRes = await fetch(`https://api.xbl.io/v2/achievements/stats/${providerId}`, {
          headers: { 
            "X-Authorization": OPENXBL_API_KEY, 
            "Accept": "application/json",
            "Accept-Language": "en-US"
          }
        });
        
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          const allStats = statsData.content?.statlistscollection?.[0]?.stats || [];
          const minutesStat = allStats.find((s: any) => 
            s.name.toLowerCase().includes("minutesplayed") || 
            s.name.toLowerCase().includes("timeplayed")
          );
          if (minutesStat) {
             minutesPlayed = parseInt(minutesStat.value || "0");
             console.log(`[XBOX] ${title.name}: ${minutesPlayed} mins`);
          }
        } else {
          console.warn(`[XBOX] Stats API returned ${statsRes.status} for ${title.name}`);
        }
      } catch (e) {
        console.warn(`Failed to fetch stats for ${title.name}: ${e.message}`);
      }

      const { data: platformGame } = await supabase
        .from("platform_games")
        .upsert({ platform_name: "XBOX", provider_game_id: providerId, raw_metadata: title }, { onConflict: "platform_name, provider_game_id" })
        .select("id").single();

      if (platformGame) {
        await supabase.from("play_stats").upsert({
          linked_account_id: account.id,
          platform_game_id: platformGame.id,
          playtime_minutes: minutesPlayed,
          last_played_at: title.titleHistory?.lastTimePlayed || title.lastPlayed || new Date().toISOString(),
        }, { onConflict: "linked_account_id, platform_game_id" });
        totalSynced++;
      }
      
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  return { success: true, count: totalSynced };
}

if (Deno.args.includes("--sync")) {
  const result = await performXboxSync();
  console.log("Xbox sync finished:", result);
  Deno.exit(0);
}

Deno.serve(async (req) => {
  try {
    const result = await performXboxSync();
    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
