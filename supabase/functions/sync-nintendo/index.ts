import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
// @ts-ignore
import { addUserAgent } from "npm:nxapi";
// @ts-ignore
import CoralApi from "npm:nxapi/coral";
// @ts-ignore
import MoonApi from "npm:nxapi/moon";

async function performNintendoSync() {
  const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace("http://kong:", "http://127.0.0.1:");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  console.log("Starting Nintendo sync...");

  // nxapi requires a user agent
  addUserAgent("GamingLibraryDashboard/1.0.0 (contact@example.com)");

  const { data: accounts, error: accountsError } = await supabase
    .from("linked_accounts")
    .select("*")
    .eq("platform_name", "NINTENDO")
    .order("last_sync_at", { ascending: true, nullsFirst: true });

  if (accountsError) return { error: "DB Error", details: accountsError };
  if (!accounts || accounts.length === 0) return { message: "No Nintendo accounts to sync." };

  let totalSynced = 0;

  for (const account of accounts) {
    try {
      console.log(`Processing Nintendo Account ID: ${account.id}`);

      const byteaToString = (bytea: any) => {
         if (!bytea) return null;
         if (typeof bytea === 'string') {
            if (bytea.startsWith('\\x')) {
              const hex = bytea.slice(2);
              return new TextDecoder().decode(Uint8Array.from(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))));
            }
            return bytea;
         }
         return new TextDecoder().decode(bytea);
      }

      const sessionToken = byteaToString(account.session_cookie) || byteaToString(account.access_token);
      if (!sessionToken) {
        console.error("No session token found for Nintendo account.");
        continue;
      }

      const titlesMap = new Map();

      // --- Method 1: Coral (NSO App) ---
      try {
        console.log("Fetching from Coral (NSO App)...");
        const { nso, data: coralAuthData } = await CoralApi.createWithSessionToken(sessionToken);
        const me = await nso.getMe();
        
        // Coral returns the last 20 games in the presence history
        // But it might also return more in other endpoints if we dig.
        // For now, let's take what's in 'presence'.
        if (me.user.presence && me.user.presence.game) {
           const game = me.user.presence.game;
           titlesMap.set(game.titleId, {
              id: game.titleId,
              name: game.name,
              playtime: game.totalPlayTime, // Note: This is usually rounded hours
              lastPlayed: me.user.presence.updatedAt * 1000,
              raw: game
           });
        }
        
        // We can also check 'friends' but that's for other users.
        // To get the user's *own* history, Coral is limited to the very recent.
      } catch (e) {
        console.error("Coral sync failed:", e.message);
      }

      // --- Method 2: Moon (Parental Controls) ---
      // This is much better for playtime and full library history.
      try {
        console.log("Fetching from Moon (Parental Controls)...");
        const { api: moon, data: moonAuthData } = await MoonApi.createWithSessionToken(sessionToken);
        const devices = await moon.getDevices();
        
        for (const device of devices) {
          console.log(`Fetching stats for device: ${device.label} (${device.deviceId})`);
          
          // Monthly summaries provide more history
          const summaries = await moon.getMonthlySummaries(device.deviceId);
          for (const month of summaries.items) {
             for (const title of month.mostPlayedTitles) {
                const existing = titlesMap.get(title.titleId);
                const minutes = title.playTimeMinutes;
                
                if (!existing || (existing.playtime < minutes)) {
                   titlesMap.set(title.titleId, {
                      id: title.titleId,
                      name: title.titleName,
                      playtime: minutes,
                      lastPlayed: null, // Parental controls doesn't give exact last played timestamp easily in this view
                      raw: title
                   });
                }
             }
          }
        }
      } catch (e) {
        console.warn("Moon (Parental Controls) sync failed or not linked:", e.message);
      }

      console.log(`Found ${titlesMap.size} unique Nintendo titles.`);

      for (const [providerId, gameData] of titlesMap) {
        const { data: platformGame } = await supabase
          .from("platform_games")
          .upsert({ 
            platform_name: "NINTENDO", 
            provider_game_id: String(providerId), 
            raw_metadata: {
              name: gameData.name,
              titleId: providerId,
              ...gameData.raw
            } 
          }, { onConflict: "platform_name, provider_game_id" })
          .select("id").single();

        if (platformGame) {
          await supabase.from("play_stats").upsert({
            linked_account_id: account.id,
            platform_game_id: platformGame.id,
            playtime_minutes: gameData.playtime,
            last_played_at: gameData.lastPlayed ? new Date(gameData.lastPlayed).toISOString() : null,
          }, { onConflict: "linked_account_id, platform_game_id" });
          totalSynced++;
        }
      }

      await supabase.from("linked_accounts").update({
        last_sync_at: new Date().toISOString(),
        sync_status: "OK"
      }).eq("id", account.id);

    } catch (err) {
      console.error(`Account sync error:`, err);
      await supabase.from("linked_accounts").update({ sync_status: "AUTH_FAILED" }).eq("id", account.id);
    }
  }

  return { success: true, count: totalSynced };
}

if (Deno.args.includes("--sync")) {
  const result = await performNintendoSync();
  console.log("Sync finished:", result);
  Deno.exit(0);
}

Deno.serve(async (req) => {
  try {
    const result = await performNintendoSync();
    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
});
