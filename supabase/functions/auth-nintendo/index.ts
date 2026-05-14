import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encodeBase64Url } from "https://deno.land/std@0.208.0/encoding/base64url.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

async function handleLogin(url: URL) {
  const userId = url.searchParams.get("user_id");
  if (!userId) return new Response("Missing user_id", { status: 400 });

  const verifierBytes = new Uint8Array(32);
  crypto.getRandomValues(verifierBytes);
  const verifier = encodeBase64Url(verifierBytes);

  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = encodeBase64Url(new Uint8Array(hash));

  const stateObj = { v: verifier, u: userId, t: Date.now() };
  const state = btoa(JSON.stringify(stateObj));

  const authUrl = `https://accounts.nintendo.com/connect/1.0.0/authorize?state=${state}&redirect_uri=npf54789db4251161a4%3A%2F%2Fauth&client_id=54789db4251161a4&scope=openid+offline+moon%3Auser+moon%3Adevice+moon%3Aevent&response_type=session_token_code&session_token_code_challenge=${challenge}&session_token_code_challenge_method=S256&theme=login_form`;

  return new Response(JSON.stringify({ authUrl, state }), {
    headers: { "Content-Type": "application/json" }
  });
}

async function handleCallback(body: any) {
  const { link, state, user_id: userId } = body;
  
  try {
    const stateObj = JSON.parse(atob(state));
    const verifier = stateObj.v;
    
    if (stateObj.u !== userId) throw new Error("User ID mismatch");

    const url = new URL(link.trim().replace("#", "?"));
    const code = url.searchParams.get("session_token_code");
    
    if (!code) throw new Error("Could not find session_token_code in link");

    const tokenRes = await fetch("https://accounts.nintendo.com/connect/1.0.0/api/session_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "GamingLibraryDashboard/1.0.0",
      },
      body: JSON.stringify({
        client_id: "54789db4251161a4",
        session_token_code: code,
        session_token_code_verifier: verifier,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenData.error_description || "Failed to get session token");

    const sessionToken = tokenData.session_token;

    const nsoRes = await fetch("https://accounts.nintendo.com/connect/1.0.0/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: "54789db4251161a4",
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer-session-token",
        session_token: sessionToken,
      }),
    });

    const nsoData = await nsoRes.json();
    
    const userRes = await fetch("https://api.nintendo.com/v1/user/me", {
      headers: { "Authorization": `Bearer ${nsoData.access_token}` }
    });
    const userData = await userRes.json();
    const nintendoId = userData.id;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await supabase
      .from("linked_accounts")
      .upsert({
        user_id: userId,
        platform_name: "NINTENDO",
        provider_account_id: nintendoId,
        session_cookie: sessionToken,
        sync_status: "OK"
      }, { onConflict: "user_id, platform_name" });

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, nintendoId }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error("Nintendo Auth Error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  let action = url.searchParams.get("action");
  let userId = url.searchParams.get("user_id");

  const paramsHeader = req.headers.get("params");
  if (paramsHeader) {
    try {
      const params = JSON.parse(paramsHeader);
      action = action || params.action;
      userId = userId || params.user_id;
    } catch (e) { }
  }

  if (action === "login") {
    const loginUrl = new URL(req.url);
    if (userId) loginUrl.searchParams.set("user_id", userId);
    return handleLogin(loginUrl);
  } else if (action === "callback") {
    const body = await req.json();
    return handleCallback(body);
  }

  return new Response("Invalid action", { status: 400 });
});
