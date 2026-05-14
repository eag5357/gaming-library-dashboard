import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import { addUserAgent } from "nxapi";
import CoralApi from "nxapi/coral";
import MoonApi from "nxapi/moon";

const byteaToString = (bytea) => {
   if (!bytea) return null;
   if (typeof bytea === 'string') {
      if (bytea.startsWith('\\x')) {
        const hex = bytea.slice(2);
        return Buffer.from(hex, 'hex').toString('utf8');
      }
      return bytea;
   }
   if (Buffer.isBuffer(bytea)) return bytea.toString('utf8');
   return Buffer.from(bytea).toString('utf8');
}

async function performNintendoSync() {
  const SUPABASE_URL = (process.env.SUPABASE_URL ?? "").replace("http://kong:", "http://127.0.0.1:");
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  console.log("Starting Nintendo sync (Node.js)...");

  addUserAgent("GamingLibraryDashboard/1.0.0 (contact@example.com)");

  const { data: accounts, error: accountsError } = await supabase
    .from("linked_accounts")
    .select("*")
    .eq("platform_name", "NINTENDO")
    .order("last_sync_at", { ascending: true, nullsFirst: true });

  if (accountsError) {
    console.error("DB Error:", accountsError);
    return;
  }
  if (!accounts || accounts.length === 0) {
    console.log("No Nintendo accounts to sync.");
    return;
  }

  let totalSynced = 0;

  for (const account of accounts) {
    try {
      console.log(`Processing Nintendo Account ID: ${account.id}`);

      let sessionToken = byteaToString(account.session_cookie) || byteaToString(account.access_token);
      
      if (!sessionToken) {
        const envToken = process.env.NINTENDO_SESSION_TOKEN;
        if (envToken) {
          console.log("Using NINTENDO_SESSION_TOKEN from environment fallback.");
          sessionToken = envToken;
        }
      }

      if (!sessionToken) {
        console.error("No session token found for Nintendo account (DB or ENV).");
        continue;
      }

      const titlesMap = new Map();

      // --- Method 1: Coral (NSO App) ---
      try {
        console.log("Fetching from Coral (NSO App)...");
        const { nso } = await CoralApi.createWithSessionToken(sessionToken);
        const me = await nso.getMe();
        
        if (me.user.presence && me.user.presence.game) {
           const game = me.user.presence.game;
           titlesMap.set(game.titleId, {
              id: game.titleId,
              name: game.name,
              playtime: game.totalPlayTime,
              lastPlayed: me.user.presence.updatedAt * 1000,
              raw: game
           });
        }

        if (me.user.playHistories && Array.isArray(me.user.playHistories)) {
          console.log(`Found ${me.user.playHistories.length} titles in play history.`);
          for (const history of me.user.playHistories) {
            const existing = titlesMap.get(history.titleId);
            if (!existing || existing.playtime < history.totalPlayTime) {
              titlesMap.set(history.titleId, {
                id: history.titleId,
                name: history.titleName,
                playtime: history.totalPlayTime,
                lastPlayed: history.lastPlayedAt * 1000,
                raw: history
              });
            }
          }
        }
      } catch (e) {
        console.error("Coral sync failed:", e.message);
      }

      // --- Method 2: Moon (Parental Controls) ---
      try {
        console.log("Fetching from Moon (Parental Controls)...");
        const moonInstance = await MoonApi.createWithSessionToken(sessionToken);
        
        // nxapi returns { moon: MoonApiInstance, data: ... }
        if (!moonInstance || !moonInstance.moon) {
          throw new Error("Failed to create Moon API instance (check if account is linked to Parental Controls).");
        }
        
        const moon = moonInstance.moon;
        const devices = await moon.getDevices();
        console.log(`Found ${devices.length} Nintendo devices linked to Parental Controls.`);
        
        for (const device of devices) {
          console.log(`Fetching stats for device: ${device.label} (${device.deviceId})`);
          const summaries = await moon.getMonthlySummaries(device.deviceId);
          if (summaries && summaries.items) {
            for (const month of summaries.items) {
               if (month.mostPlayedTitles) {
                 for (const title of month.mostPlayedTitles) {
                    const existing = titlesMap.get(title.titleId);
                    const minutes = title.playTimeMinutes;
                    
                    if (!existing || (existing.playtime < minutes)) {
                       titlesMap.set(title.titleId, {
                          id: title.titleId,
                          name: title.titleName,
                          playtime: minutes,
                          lastPlayed: null,
                          raw: title
                       });
                    }
                 }
               }
            }
          }
        }
      } catch (e) {
        console.warn("Moon (Parental Controls) sync failed or not linked:", e);
        if (e.response) {
            console.warn("Moon Response Status:", e.response.status);
            try {
              const body = await e.response.json();
              console.warn("Moon Response Body:", JSON.stringify(body, null, 2));
            } catch (jsonErr) {}
        }
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

  console.log("Sync finished. Total records processed:", totalSynced);
}

performNintendoSync();
