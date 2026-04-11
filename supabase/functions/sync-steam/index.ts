import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  // Fetch environment variables inside the handler to ensure they are available
  // These are automatically provided by Supabase in production and during local serve
  const STEAM_API_KEY = Deno.env.get("STEAM_API_KEY") ?? "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!STEAM_API_KEY) {
    console.error("STEAM_API_KEY is not configured");
    return new Response(
      JSON.stringify({ error: "STEAM_API_KEY is not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // Initialize Supabase client with the service role key to bypass RLS for administrative tasks
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log("Starting Steam sync...");

    // 1. Fetch linked Steam accounts that need syncing
    const { data: accounts, error: accountsError } = await supabase
      .from("linked_accounts")
      .select("*")
      .eq("platform_name", "STEAM")
      .order("last_sync_at", { ascending: true, nullsFirst: true })
      .limit(50);

    if (accountsError) {
      console.error("Error fetching accounts:", accountsError);
      throw accountsError;
    }

    if (!accounts || accounts.length === 0) {
      console.log("No Steam accounts to sync.");
      return new Response(
        JSON.stringify({ message: "No Steam accounts to sync." }),
        { headers: { "Content-Type": "application/json" }, status: 200 }
      );
    }

    let syncedCount = 0;

    // 2. Process each account
    for (const account of accounts) {
      try {
        const steamId = account.provider_account_id;
        console.log(`Syncing Steam ID: ${steamId}`);
        
        // Fetch owned games from Steam Web API (using HTTPS)
        const steamApiUrl = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${steamId}&format=json&include_appinfo=1`;
        const response = await fetch(steamApiUrl);
        
        if (!response.ok) {
           throw new Error(`Steam API error: ${response.status} ${response.statusText}`);
        }
        
        const steamData = await response.json();
        const games = steamData.response?.games || [];

        console.log(`Found ${games.length} games for Steam ID: ${steamId}`);

        // 3. Upsert data into platform_games and play_stats
        for (const game of games) {
          // Upsert the raw provider metadata into platform_games
          const { data: platformGame, error: pgError } = await supabase
            .from("platform_games")
            .upsert({
              platform_name: "STEAM",
              provider_game_id: game.appid.toString(),
              raw_metadata: game
            }, { 
              onConflict: "platform_name, provider_game_id" 
            })
            .select("id")
            .single();
            
          if (pgError || !platformGame) {
             console.error(`Error upserting platform_game for appid ${game.appid}:`, pgError);
             continue;
          }

          // Upsert the user's playtime statistics
          const { error: playStatsError } = await supabase
            .from("play_stats")
            .upsert({
              linked_account_id: account.id,
              platform_game_id: platformGame.id,
              playtime_minutes: game.playtime_forever,
              last_played_at: game.rtime_last_played ? new Date(game.rtime_last_played * 1000).toISOString() : null,
            }, { 
              onConflict: "linked_account_id, platform_game_id" 
            });

          if (playStatsError) {
            console.error(`Error upserting play_stats for appid ${game.appid}:`, playStatsError);
          }
        }

        // 4. Update the account's sync status to OK
        await supabase
          .from("linked_accounts")
          .update({ 
            last_sync_at: new Date().toISOString(),
            sync_status: "OK"
          })
          .eq("id", account.id);

        syncedCount++;

      } catch (err) {
        console.error(`Failed to sync account ${account.id}:`, err);
        // Mark as failed so we can inspect or retry later
        await supabase
          .from("linked_accounts")
          .update({ 
            sync_status: "AUTH_FAILED" 
          })
          .eq("id", account.id);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Successfully synced ${syncedCount} out of ${accounts.length} accounts.` 
      }),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    console.error("Worker error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    );
  }
});
