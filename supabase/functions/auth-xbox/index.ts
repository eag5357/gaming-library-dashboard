import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSupabaseClient } from "../_shared/cors.ts";

function getEnv() {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
  const AZURE_CLIENT_ID = Deno.env.get("AZURE_CLIENT_ID") || "";
  const AZURE_CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET") || "";
  const PUBLIC_SUPABASE_URL = SUPABASE_URL.replace("http://kong:", "http://127.0.0.1:");
  const FRONTEND_URL = "http://localhost:5173";
  return { SUPABASE_URL, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, PUBLIC_SUPABASE_URL, FRONTEND_URL };
}

export async function handleLogin(url: URL) {
  const { AZURE_CLIENT_ID, PUBLIC_SUPABASE_URL } = getEnv();
  const userId = url.searchParams.get("user_id");
  if (!userId) return new Response("Missing user_id", { status: 400 });

  const callbackUrl = `${PUBLIC_SUPABASE_URL}/functions/v1/auth-xbox?action=callback`;
  
  const msAuthUrl = new URL("https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize");
  msAuthUrl.searchParams.set("client_id", AZURE_CLIENT_ID);
  msAuthUrl.searchParams.set("response_type", "code");
  msAuthUrl.searchParams.set("redirect_uri", callbackUrl);
  msAuthUrl.searchParams.set("scope", "XboxLive.signin offline_access");
  msAuthUrl.searchParams.set("state", userId);

  return Response.redirect(msAuthUrl.toString(), 302);
}

export async function handleCallback(url: URL) {
  const { AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, PUBLIC_SUPABASE_URL, FRONTEND_URL } = getEnv();
  const code = url.searchParams.get("code");
  const userId = url.searchParams.get("state");

  if (!code || !userId) {
    return Response.redirect(`${FRONTEND_URL}/?auth=error&platform=xbox`, 302);
  }

  try {
    const callbackUrl = `${PUBLIC_SUPABASE_URL}/functions/v1/auth-xbox?action=callback`;

    const tokenRes = await fetch("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: AZURE_CLIENT_ID,
        client_secret: AZURE_CLIENT_SECRET,
        code,
        redirect_uri: callbackUrl,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await tokenRes.json();
    const msAccessToken = tokenData.access_token;

    const xblRes = await fetch("https://user.auth.xboxlive.com/user/authenticate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        Properties: { AuthMethod: "RPS", SiteName: "user.auth.xboxlive.com", RpsTicket: `d=${msAccessToken}` },
        RelyingParty: "http://auth.xboxlive.com",
        TokenType: "JWT"
      }),
    });
    const xblData = await xblRes.json();
    const xblToken = xblData.Token;

    const xstsRes = await fetch("https://xsts.auth.xboxlive.com/xsts/authorize", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        Properties: { SandboxId: "RETAIL", UserTokens: [xblToken] },
        RelyingParty: "http://xboxlive.com",
        TokenType: "JWT"
      }),
    });
    const xstsData = await xstsRes.json();
    const xuid = xstsData.DisplayClaims.xui[0].xid;

    if (!xuid) throw new Error("Could not retrieve XUID");

    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("linked_accounts")
      .upsert({
        user_id: userId,
        platform_name: "XBOX",
        provider_account_id: xuid,
        sync_status: "OK"
      }, { onConflict: "user_id, platform_name" });

    if (error) throw error;

    return Response.redirect(`${FRONTEND_URL}/?auth=success&platform=xbox`, 302);

  } catch (err) {
    console.error("Xbox Auth Error:", err);
    return Response.redirect(`${FRONTEND_URL}/?auth=error&platform=xbox`, 302);
  }
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
