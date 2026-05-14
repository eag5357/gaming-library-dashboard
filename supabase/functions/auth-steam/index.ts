import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSupabaseClient } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const PUBLIC_SUPABASE_URL = SUPABASE_URL.replace("http://kong:", "http://127.0.0.1:");
const FRONTEND_URL = "http://localhost:5173";

export async function handleLogin(url: URL) {
  const userId = url.searchParams.get("user_id");
  if (!userId) return new Response("Missing user_id", { status: 400 });

  const callbackUrl = `${PUBLIC_SUPABASE_URL}/functions/v1/auth-steam?action=callback&user_id=${userId}`;
  
  const steamOpenIdUrl = new URL("https://steamcommunity.com/openid/login");
  steamOpenIdUrl.searchParams.set("openid.ns", "http://specs.openid.net/auth/2.0");
  steamOpenIdUrl.searchParams.set("openid.mode", "checkid_setup");
  steamOpenIdUrl.searchParams.set("openid.return_to", callbackUrl);
  steamOpenIdUrl.searchParams.set("openid.realm", `${PUBLIC_SUPABASE_URL}/functions/v1/auth-steam`);
  steamOpenIdUrl.searchParams.set("openid.identity", "http://specs.openid.net/auth/2.0/identifier_select");
  steamOpenIdUrl.searchParams.set("openid.claimed_id", "http://specs.openid.net/auth/2.0/identifier_select");

  return Response.redirect(steamOpenIdUrl.toString(), 302);
}

export async function handleCallback(url: URL) {
  const userId = url.searchParams.get("user_id");
  if (!userId) return new Response("Missing user_id", { status: 400 });

  const params = new URLSearchParams(url.search);
  params.set("openid.mode", "check_authentication");
  
  const verifyRes = await fetch("https://steamcommunity.com/openid/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  
  const verifyText = await verifyRes.text();
  if (!verifyText.includes("is_valid:true")) {
    return Response.redirect(`${FRONTEND_URL}/?auth=error&platform=steam`, 302);
  }

  const claimedId = url.searchParams.get("openid.claimed_id") || "";
  const steamId = claimedId.split("/").pop();

  if (!steamId || !/^\d+$/.test(steamId)) {
    return Response.redirect(`${FRONTEND_URL}/?auth=error&platform=steam`, 302);
  }

  const supabase = getSupabaseClient();
  
  const { error } = await supabase
    .from("linked_accounts")
    .upsert({
      user_id: userId,
      platform_name: "STEAM",
      provider_account_id: steamId,
      sync_status: "OK"
    }, { onConflict: "user_id, platform_name" });

  if (error) {
    console.error("Database error:", error);
    return Response.redirect(`${FRONTEND_URL}/?auth=error&platform=steam`, 302);
  }

  return Response.redirect(`${FRONTEND_URL}/?auth=success&platform=steam`, 302);
}

if (!Deno.env.get("IS_TEST")) {
  Deno.serve(async (req: Request) => {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (action === "login") {
      return handleLogin(url);
    } else if (action === "callback") {
      return handleCallback(url);
    }

    return new Response("Invalid action", { status: 400 });
  });
}
