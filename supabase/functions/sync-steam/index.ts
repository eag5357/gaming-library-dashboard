import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function performSteamSync() {
  const STEAM_API_KEY = Deno.env.get("STEAM_API_KEY") ?? "";
  const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace("http://kong:", "http://127.0.0.1:");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!STEAM_API_KEY) {
    throw new Error("STEAM_API_KEY is not configured");
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  console.log("Starting Steam sync...");

  const { data: accounts, error: accountsError } = await supabase
    .from("linked_accounts")
    .select("*")
    .eq("platform_name", "STEAM");

  if (accountsError) throw accountsError;
  if (!accounts || accounts.length === 0) return { message: "No accounts" };

  let syncedCount = 0;
  for (const account of accounts) {
    const steamId = account.provider_account_id;
    const response = await fetch(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${steamId}&format=json&include_appinfo=1`);
    const steamData = await response.json();
    const games = steamData.response?.games || [];

    for (const game of games) {
      const { data: platformGame } = await supabase
        .from("platform_games")
        .upsert({ platform_name: "STEAM", provider_game_id: game.appid.toString(), raw_metadata: game }, { onConflict: "platform_name, provider_game_id" })
        .select("id").single();

      if (platformGame) {
        await supabase.from("play_stats").upsert({
          linked_account_id: account.id,
          platform_game_id: platformGame.id,
          playtime_minutes: game.playtime_forever,
          last_played_at: game.rtime_last_played ? new Date(game.rtime_last_played * 1000).toISOString() : null,
        }, { onConflict: "linked_account_id, platform_game_id" });
      }
    }
    await supabase.from("linked_accounts").update({ last_sync_at: new Date().toISOString(), sync_status: "OK" }).eq("id", account.id);
    syncedCount++;
  }
  return { success: true, count: syncedCount };
}

if (Deno.args.includes("--sync")) {
  const result = await performSteamSync();
  console.log("Steam sync finished:", result);
  Deno.exit(0);
}

Deno.serve(async (req) => {
  try {
    const result = await performSteamSync();
    return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
});
