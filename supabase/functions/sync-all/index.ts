import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import { corsHeaders, getAuthContext, getSupabaseClient } from "../_shared/cors.ts";

const PLATFORMS = ["sync-steam", "sync-xbox", "sync-psn", "sync-nintendo"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authContext = await getAuthContext(req);
  if (!authContext) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { 
      status: 401, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }

  const supabase = getSupabaseClient();
  console.log("Master Sync started at:", new Date().toISOString());

  const results: Record<string, any> = {};
  const targetUserId = authContext.isServiceRole ? undefined : authContext.userId;

  for (const platform of PLATFORMS) {
    console.log(`Triggering ${platform}${targetUserId ? ` for user ${targetUserId}` : ''}...`);
    try {
      // Pass userId in headers if it's a user-level sync
      const { data, error } = await supabase.functions.invoke(platform, {
        headers: targetUserId ? { 'Authorization': `Bearer ${req.headers.get('Authorization')?.replace(/^[Bb]earer\s+/, '')}` } : undefined
      });
      if (error) {
        console.error(`Error invoking ${platform}:`, error);
        results[platform] = { error: error.message || error, status: error.status };
      } else {
        console.log(`Success: ${platform} synced ${data.count || 0} items.`);
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
      results["normalization"] = { error: normError.message || normError };
    } else {
      console.log(`Success: Normalized ${normData.count || 0} games.`);
      results["normalization"] = normData;
    }
  } catch (e: any) {
    console.error("Exception during final normalization:", e.message);
    results["normalization"] = { error: e.message };
  }

  return new Response(JSON.stringify({ success: true, results }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
