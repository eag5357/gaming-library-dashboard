import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1";
import { corsHeaders, isAuthorized } from "../_shared/cors.ts";

export const byteaToString = (bytea: any) => {
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

export async function performNintendoSync() {
  const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace("http://kong:", "http://127.0.0.1:");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  console.log("Starting Nintendo sync (Safe/Moon API)...");

  const { data: accounts, error: accountsError } = await supabase
    .from("linked_accounts")
    .select("*")
    .eq("platform_name", "NINTENDO");

  if (accountsError) return { error: "DB Error", details: accountsError };
  if (!accounts || accounts.length === 0) return { message: "No Nintendo accounts to sync." };

  let totalSynced = 0;

  for (const account of accounts) {
    try {
      console.log(`Processing Nintendo Account ID: ${account.id}`);

      let sessionToken = byteaToString(account.session_cookie) || byteaToString(account.access_token);
      
      if (!sessionToken) {
        sessionToken = Deno.env.get("NINTENDO_SESSION_TOKEN") ?? null;
      }

      if (!sessionToken) {
        console.error("No session token found.");
        continue;
      }

      // 1. Exchange Session Token for Access Token (Official Moon Client ID)
      const tokenRes = await fetch('https://accounts.nintendo.com/connect/1.0.0/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'NASDKAPI; Android' },
          body: JSON.stringify({
              client_id: '54789befb391a838', 
              session_token: sessionToken,
              grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer-session-token',
              scope: 'openid user user.mii moonUser:administration moonDevice:create moonOwnedDevice:administration moonParentalControlSetting moonParentalControlSetting:update moonParentalControlSettingState moonPairingState moonSmartDevice:administration moonDailySummary moonMonthlySummary'
          })
      });
      const tokenData = await tokenRes.json();
      if (tokenData.error) throw new Error(`Auth Error: ${tokenData.error_description || tokenData.error}`);
      const moonToken = tokenData.access_token;

      // 2. Get naId
      const userMeRes = await fetch("https://api.accounts.nintendo.com/2.0.0/users/me", {
        headers: { "Authorization": `Bearer ${moonToken}` }
      });
      const userData = await userMeRes.json();
      const naId = userData.id;

      const titlesMap = new Map();
      const commonHeaders = { 
        'Authorization': `Bearer ${moonToken}`, 
        'User-Agent': 'moon_ANDROID/3.0.0 (com.nintendo.znma; build:1000; ANDROID 33)',
        'X-Moon-App-Id': 'com.nintendo.znma',
        'X-Moon-Os': 'ANDROID',
        'X-Moon-Os-Version': '33',
        'X-Moon-TimeZone': 'Europe/London',
        'X-Moon-Os-Language': 'en-GB',
        'X-Moon-App-Language': 'en-GB',
        'X-Moon-App-Display-Version': '3.0.0',
        'X-Moon-App-Internal-Version': '1000',
      };

      // 3. Get Devices
      const devicesResp = await fetch(`https://api-lp1.pctl.srv.nintendo.net/moon/v1/users/${naId}/devices`, {
          headers: commonHeaders
      });
      const devicesData = await devicesResp.json();
      const devices = devicesData.items || [];

      for (const device of devices) {
          console.log(`Syncing device: ${device.label || 'Switch'}`);
          
          // 4. Get Monthly Summaries
          const summariesResp = await fetch(`https://api-lp1.pctl.srv.nintendo.net/moon/v1/devices/${device.deviceId}/monthly_summaries`, {
              headers: commonHeaders
          });
          const summariesData = await summariesResp.json();
          
          if (summariesData.items) {
              for (const summaryLink of summariesData.items) {
                  const detailResp = await fetch(`https://api-lp1.pctl.srv.nintendo.net/moon/v1/devices/${device.deviceId}/monthly_summaries/${summaryLink.month}`, {
                      headers: commonHeaders
                  });
                  const detail = await detailResp.json();
                  if (detail.mostPlayedTitles) {
                      for (const title of detail.mostPlayedTitles) {
                          const existing = titlesMap.get(title.titleId);
                          if (!existing || existing.playtime < title.playTimeMinutes) {
                              titlesMap.set(title.titleId, { id: title.titleId, name: title.titleName, playtime: title.playTimeMinutes, raw: title });
                          }
                      }
                  }
              }
          }

          // 5. Get Daily Summaries
          const dailyResp = await fetch(`https://api-lp1.pctl.srv.nintendo.net/moon/v1/devices/${device.deviceId}/daily_summaries`, {
              headers: commonHeaders
          });
          const dailyData = await dailyResp.json();
          if (dailyData.items) {
              for (const daily of dailyData.items) {
                  if (daily.devicePlayers) {
                      for (const player of daily.devicePlayers) {
                          if (player.playedApps) {
                              for (const app of player.playedApps) {
                                  const titleId = app.applicationId;
                                  const minutes = Math.floor((app.playingTime || 0) / 60);
                                  const existing = titlesMap.get(titleId);
                                  if (existing) {
                                      existing.playtime += minutes;
                                  } else {
                                      titlesMap.set(titleId, { id: titleId, name: "Unknown Game", playtime: minutes, raw: app });
                                  }
                              }
                          }
                      }
                  }
                  if (daily.playedApps) {
                      for (const app of daily.playedApps) {
                          const existing = titlesMap.get(app.applicationId);
                          if (existing) {
                              existing.name = app.title;
                              existing.raw = { ...existing.raw, ...app };
                          }
                      }
                  }
              }
          }
      }

      console.log(`Found ${titlesMap.size} unique Nintendo titles.`);

      for (const [providerId, gameData] of titlesMap) {
        console.log(`Syncing title: ${gameData.name} (${providerId}) with ${gameData.playtime} minutes.`);
        const { data: platformGame } = await supabase
          .from("platform_games")
          .upsert({ 
            platform_name: "NINTENDO", 
            provider_game_id: String(providerId), 
            raw_metadata: { name: gameData.name, titleId: providerId, ...gameData.raw } 
          }, { onConflict: "platform_name, provider_game_id" })
          .select("id").single();

        if (platformGame) {
          await supabase.from("play_stats").upsert({
            linked_account_id: account.id,
            platform_game_id: platformGame.id,
            playtime_minutes: gameData.playtime,
          }, { onConflict: "linked_account_id, platform_game_id" });
          totalSynced++;
        }
      }

      await supabase.from("linked_accounts").update({ last_sync_at: new Date().toISOString(), sync_status: "OK" }).eq("id", account.id);

    } catch (err: any) {
      console.error(`Account sync error:`, err);
      await supabase.from("linked_accounts").update({ sync_status: "AUTH_FAILED" }).eq("id", account.id);
    }
  }

  return { success: true, count: totalSynced };
}

if (import.meta.main) {
  if (Deno.args.includes("--sync")) {
    const result = await performNintendoSync();
    console.log("Sync finished:", result);
    Deno.exit(0);
  }

  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (!(await isAuthorized(req))) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { 
        status: 401, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    try {
      const result = await performNintendoSync();
      return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: corsHeaders });
    }
  });
}
