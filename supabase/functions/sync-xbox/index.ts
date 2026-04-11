import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const OPENXBL_API_KEY = Deno.env.get("OPENXBL_API_KEY") ?? "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!OPENXBL_API_KEY) {
    return new Response(JSON.stringify({ error: "OPENXBL_API_KEY missing" }), { status: 500 });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Verify API Key and get XUID via /account
    console.log("Verifying OpenXBL connectivity...");
    const accountRes = await fetch("https://api.xbl.io/v2/account", {
      headers: { 
        "X-Authorization": OPENXBL_API_KEY, 
        "Accept": "application/json",
        "Accept-Language": "en-US"
      }
    });

    if (!accountRes.ok) {
      throw new Error("Account verification failed: " + accountRes.status);
    }

    const accountData = await accountRes.json();
    const xuid = accountData.content?.profileUsers?.[0]?.id || "";
    console.log(`OpenXBL Verified. Detected XUID: ${xuid}`);

    // Fetch ALL stats in one go
    let globalStats: any[] = [];
    try {
      const statsRes = await fetch(`https://api.xbl.io/v2/player/stats/${xuid}`, {
        headers: { "X-Authorization": OPENXBL_API_KEY, "Accept": "application/json", "Accept-Language": "en-US" }
      });
      if (statsRes.ok) {
        const statsData = await statsRes.ok ? await statsRes.json() : {};
        globalStats = statsData.content?.statlistscollection || [];
        console.log("Global stats fetched.");
      }
    } catch (e) { console.error("Global stats failed"); }

    // 2. Fetch Xbox accounts from DB
    const { data: accounts, error: accountsError } = await supabase
      .from("linked_accounts")
      .select("*")
      .eq("platform_name", "XBOX");

    if (accountsError) throw accountsError;

    let totalSynced = 0;

    for (const account of accounts) {
      try {
        console.log(`Syncing Xbox library via /v2/titles for: ${account.provider_account_id}`);

        const xblRes = await fetch("https://api.xbl.io/v2/titles", {
          headers: {
            "X-Authorization": OPENXBL_API_KEY,
            "Accept": "application/json",
            "Accept-Language": "en-US",
          }
        });

        if (!xblRes.ok) {
          const err = await xblRes.text();
          console.error(`OpenXBL Error: ${err}`);
          continue;
        }
        
        const data = await xblRes.json();
        let rawItems = [];
        if (typeof data.content === 'string') {
           try {
             const parsed = JSON.parse(data.content);
             rawItems = Array.isArray(parsed) ? parsed : Object.values(parsed);
           } catch (e) { console.error("JSON Parse Error:", e); }
        } else if (data.content) {
           rawItems = Array.isArray(data.content) ? data.content : Object.values(data.content);
        }
        
        // Find the nested titles array
        const titles = rawItems.find(item => Array.isArray(item)) || [];
        console.log(`Extracted ${titles.length} real Xbox titles.`);

        for (const title of titles) {
          const providerId = title.titleId?.toString();
          if (!providerId) continue;

          console.log(`Syncing stats for: ${title.name}`);
          
          let minutesPlayed = 0;
          try {
            // Fetch detailed stats using the XUID we detected
            const statsRes = await fetch(`https://api.xbl.io/v2/stats/player/${xuid}/title/${providerId}`, {
              headers: { 
                "X-Authorization": OPENXBL_API_KEY, 
                "Accept": "application/json",
                "Accept-Language": "en-US"
              }
            });
            console.log(`Stats Status for ${title.name}: ${statsRes.status}`);
            if (statsRes.ok) {
              const statsData = await statsRes.json();
              console.log(`${title.name} Content Keys:`, Object.keys(statsData.content || {}));
              // Look for minutes played in the stats array
              const allStats = statsData.content?.statlistscollection?.[0]?.stats || [];
              const minutesStat = allStats.find((s: any) => s.name.toLowerCase().includes("minutesplayed"));
              if (minutesStat) {
                 minutesPlayed = parseInt(minutesStat.value || "0");
                 console.log(`Found ${minutesPlayed} mins for ${title.name}`);
              }
            }
          } catch (e) {
            console.error(`Failed to fetch stats for ${title.name}:`, e);
          }

          // 1. Upsert into platform_games
          const { data: platformGame, error: pgError } = await supabase
            .from("platform_games")
            .upsert({
              platform_name: "XBOX",
              provider_game_id: providerId,
              raw_metadata: title
            }, { onConflict: "platform_name, provider_game_id" })
            .select("id")
            .single();

          if (pgError || !platformGame) continue;

          // 2. Upsert play stats
          await supabase
            .from("play_stats")
            .upsert({
              linked_account_id: account.id,
              platform_game_id: platformGame.id,
              playtime_minutes: minutesPlayed,
              completion_percentage: title.achievement?.progressPercentage || 0,
              last_played_at: title.titleHistory?.lastTimePlayed || new Date().toISOString(),
            }, { onConflict: "linked_account_id, platform_game_id" });
          
          totalSynced++;
          // Delay to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      } catch (err) {
        console.error(`Failed to sync Xbox account ${account.id}:`, err);
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: `Synced ${totalSynced} Xbox titles with stats.` }),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("Worker error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
