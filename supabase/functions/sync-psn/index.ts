import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import * as PSN from "npm:psn-api";

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

export async function performPsnSync() {
  const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace("http://kong:", "http://127.0.0.1:");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const PSN_NPSSO = Deno.env.get("PSN_NPSSO") ?? "";

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  console.log("Starting PlayStation sync...");

  const { data: accounts, error: accountsError } = await supabase
    .from("linked_accounts")
    .select("*")
    .eq("platform_name", "PLAYSTATION")
    .order("last_sync_at", { ascending: true, nullsFirst: true });

  if (accountsError) return { error: "DB Error", details: accountsError };
  if (!accounts || accounts.length === 0) return { message: "No PSN accounts to sync." };

  let totalSynced = 0;

  for (const account of accounts) {
    try {
      console.log(`Processing PSN Account ID: ${account.id}`);

      let refreshToken = byteaToString(account.refresh_token);
      let auth: any = null;

      if (refreshToken) {
        try {
          // @ts-ignore
          auth = await PSN.exchangeRefreshTokenForAccessToken(refreshToken);
          console.log("Token refreshed.");
        } catch (e) { console.warn("Refresh failed."); }
      }

      if (!auth && PSN_NPSSO) {
        try {
          // @ts-ignore
          const accessCode = await PSN.exchangeNpssoForCode(PSN_NPSSO.replace(/['"]/g, ""));
          // @ts-ignore
          auth = await PSN.exchangeCodeForAccessToken(accessCode);
          console.log("NPSSO bootstrap successful.");
        } catch (e) { console.error("NPSSO exchange failed:", e); }
      }

      if (!auth) throw new Error("No authentication possible.");

      // FETCH DATA
      const allTitlesMap = new Map();
      
      // Source A: getUserPlayedGames (Best for playtime, up to 200 titles)
      try {
        console.log("Fetching played games list (getUserPlayedGames)...");
        // @ts-ignore
        const playedGames = await PSN.getUserPlayedGames(auth, "me", { limit: 200 });
        if (playedGames.titles) {
          console.log(`getUserPlayedGames returned ${playedGames.titles.length} titles.`);
          for (const title of playedGames.titles) {
             allTitlesMap.set(title.titleId, title);
          }
        }
      } catch (e: any) { console.error("getUserPlayedGames failed:", e.message); }

      // Source B: getRecentlyPlayedGames (Additional recent source)
      try {
        console.log("Fetching recently played list (getRecentlyPlayedGames)...");
        // @ts-ignore
        const recentlyPlayed: any = await PSN.getRecentlyPlayedGames(auth, { limit: 100 });
        if (recentlyPlayed.data?.recentlyPlayedGames) {
          console.log(`getRecentlyPlayedGames returned ${recentlyPlayed.data.recentlyPlayedGames.length} titles.`);
          for (const title of recentlyPlayed.data.recentlyPlayedGames) {
             if (!allTitlesMap.has(title.titleId)) {
                allTitlesMap.set(title.titleId, title);
             }
          }
        }
      } catch (e: any) { console.error("getRecentlyPlayedGames failed:", e.message); }

      // Source C: getUserTitles (Deep backup for library coverage)
      try {
        console.log("Fetching library list (getUserTitles)...");
        // @ts-ignore
        const userTitles = await PSN.getUserTitles(auth, "me");
        if (userTitles.trophyTitles) {
          console.log(`getUserTitles returned ${userTitles.trophyTitles.length} titles.`);
          for (const title of userTitles.trophyTitles) {
             if (!allTitlesMap.has(title.npCommunicationId)) {
                allTitlesMap.set(title.npCommunicationId, title);
             }
          }
        }
      } catch (e: any) { console.error("getUserTitles failed:", e.message); }

      console.log(`Total unique titles found across all methods: ${allTitlesMap.size}`);

      const BLACKLIST = ["Netflix", "Peacock", "YouTube", "YouTube TV", "Disney+", "Prime Video", "ESPN", "Hulu", "Twitch", "Spotify"];

      for (const [id, game] of allTitlesMap) {
        const providerId = game.titleId || game.npCommunicationId;
        const name = game.name || game.trophyTitleName;
        if (!providerId || !name) continue;

        // Skip non-game media apps
        if (BLACKLIST.some(app => name.toLowerCase().includes(app.toLowerCase()))) {
          console.log(`Skipping non-game app: ${name}`);
          continue;
        }

        const { data: platformGame } = await supabase
          .from("platform_games")
          .upsert({ platform_name: "PLAYSTATION", provider_game_id: providerId, raw_metadata: game }, { onConflict: "platform_name, provider_game_id" })
          .select("id").single();

        if (platformGame) {
          let minutes = 0;
          const duration = game.playDuration; // e.g. "PT1H30M"
          if (duration) {
            const hMatch = duration.match(/(\d+)H/);
            const mMatch = duration.match(/(\d+)M/);
            if (hMatch) minutes += parseInt(hMatch[1]) * 60;
            if (mMatch) minutes += parseInt(mMatch[1]);
            console.log(`Syncing Playtime: ${name} -> ${minutes} mins (${duration})`);
          }

          await supabase.from("play_stats").upsert({
            linked_account_id: account.id,
            platform_game_id: platformGame.id,
            playtime_minutes: minutes,
            last_played_at: game.lastPlayedDateTime || null,
          }, { onConflict: "linked_account_id, platform_game_id" });
          totalSynced++;
        }
      }

      const encoder = new TextEncoder();
      await supabase.from("linked_accounts").update({
        access_token: encoder.encode(auth.accessToken),
        refresh_token: encoder.encode(auth.refreshToken),
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

if (import.meta.main && Deno.args.includes("--sync")) {
  const result = await performPsnSync();
  console.log("Sync finished:", result);
  Deno.exit(0);
}

if (import.meta.main) {
  Deno.serve(async (req) => {
    try {
      const result = await performPsnSync();
      return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
    }
  });
}
