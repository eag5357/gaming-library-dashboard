import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";

const PLATFORMS = ["sync-steam", "sync-xbox", "sync-psn", "sync-nintendo"];

Deno.serve(async (req) => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Missing Supabase configuration" }), { status: 500 });
  }

  // Ensure internal URL is correct for local vs production
  const supabaseUrl = SUPABASE_URL.replace("http://kong:", "http://127.0.0.1:");
  const supabase = createClient(supabaseUrl, SUPABASE_SERVICE_ROLE_KEY);

  console.log("Master Sync started at:", new Date().toISOString());

  const results: Record<string, any> = {};

  for (const platform of PLATFORMS) {
    console.log(`Triggering ${platform}...`);
    try {
      const { data, error } = await supabase.functions.invoke(platform);
      if (error) {
        console.error(`Error invoking ${platform}:`, error);
        results[platform] = { error: error.message };
      } else {
        results[platform] = data;
      }
    } catch (e: any) {
      console.error(`Exception during ${platform} invocation:`, e.message);
      results[platform] = { error: e.message };
    }
  }

  console.log("Master Sync finished.");

  // 3. Trigger Normalization once at the end
  console.log("Triggering final normalization...");
  try {
    const { data: normData, error: normError } = await supabase.functions.invoke('normalize-games');
    if (normError) {
      console.error("Master Normalization failed:", normError);
      results["normalization"] = { error: normError.message };
    } else {
      results["normalization"] = normData;
    }
  } catch (e: any) {
    console.error("Exception during final normalization:", e.message);
    results["normalization"] = { error: e.message };
  }

  return new Response(JSON.stringify({ success: true, results }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
