import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encodeBase64Url } from "https://deno.land/std@0.208.0/encoding/base64url.ts";
import { corsHeaders, getSupabaseClient } from "../_shared/cors.ts";

async function handleLogin(url: URL) {
  const userId = url.searchParams.get("user_id");
  if (!userId) return new Response("Missing user_id", { status: 400, headers: corsHeaders });

  const verifierBytes = new Uint8Array(32);
  crypto.getRandomValues(verifierBytes);
  const verifier = encodeBase64Url(verifierBytes);

  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = encodeBase64Url(new Uint8Array(hash));

  const stateObj = { v: verifier, u: userId, t: Date.now() };
  const rawState = btoa(JSON.stringify(stateObj));
  const encodedState = encodeURIComponent(rawState);

  // Use the established Moon (Parental Controls) Client ID and Redirect URI
  const MOON_CLIENT_ID = '54789befb391a838';
  const MOON_REDIRECT_URI = 'npf54789befb391a838://auth';
  
  // Use exact scope string from working get_nintendo_token.js
  const scope = 'openid user user.mii moonUser:administration moonDevice:create moonOwnedDevice:administration moonParentalControlSetting moonParentalControlSetting:update moonParentalControlSettingState moonPairingState moonSmartDevice:administration moonDailySummary moonMonthlySummary';
  const encodedScope = scope.split(' ').join('+').replace(/:/g, '%3A');
  
  const authUrl = `https://accounts.nintendo.com/connect/1.0.0/authorize?state=${encodedState}&redirect_uri=${encodeURIComponent(MOON_REDIRECT_URI)}&client_id=${MOON_CLIENT_ID}&scope=${encodedScope}&response_type=session_token_code&session_token_code_challenge=${challenge}&session_token_code_challenge_method=S256&theme=login_form`;

  return new Response(JSON.stringify({ authUrl, state: rawState }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

async function handleCallback(body: any) {
  const { link, state, user_id: userId } = body;
  console.log("Nintendo Callback received for user:", userId);
  
  const MOON_CLIENT_ID = '54789befb391a838';
  
  try {
    if (!state) throw new Error("Missing state parameter");
    if (!link) throw new Error("Missing link parameter");

    let stateObj;
    try {
      stateObj = JSON.parse(atob(state));
    } catch (e) {
      console.error("Failed to decode state:", state);
      throw new Error("Invalid state format");
    }

    const verifier = stateObj.v;
    if (userId && stateObj.u !== userId) {
      console.warn(`User ID mismatch: Body=${userId}, State=${stateObj.u}`);
    }

    let url;
    try {
      url = new URL(link.trim().replace("#", "?"));
    } catch (e) {
      console.error("Failed to parse link:", link);
      throw new Error("Invalid Nintendo link format. Please paste the full 'npf...' link.");
    }

    const code = url.searchParams.get("session_token_code");
    if (!code) throw new Error("Could not find session_token_code in the provided link.");

    console.log("Exchanging session_token_code for session_token...");
    const tokenRes = await fetch("https://accounts.nintendo.com/connect/1.0.0/api/session_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "GamingLibraryDashboard/1.0.0",
      },
      body: JSON.stringify({
        client_id: MOON_CLIENT_ID,
        session_token_code: code,
        session_token_code_verifier: verifier,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error("Session Token Error:", tokenData);
      throw new Error(tokenData.error_description || tokenData.error || "Failed to get session token");
    }

    const sessionToken = tokenData.session_token;

    console.log("Exchanging session_token for moon_token...");
    const nsoRes = await fetch("https://accounts.nintendo.com/connect/1.0.0/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: MOON_CLIENT_ID,
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer-session-token",
        session_token: sessionToken,
      }),
    });

    const nsoData = await nsoRes.json();
    if (!nsoRes.ok) {
      console.error("Moon Token Error:", nsoData);
      throw new Error(nsoData.error_description || "Failed to get access token");
    }

    console.log("Fetching Nintendo user data...");
    const userMeRes = await fetch("https://api.accounts.nintendo.com/2.0.0/users/me", {
      headers: { "Authorization": `Bearer ${nsoData.access_token}` }
    });
    const userData = await userMeRes.json();
    if (!userMeRes.ok) throw new Error("Failed to get Nintendo user data");
    const nintendoId = userData.id;

    console.log(`Linking Nintendo ID ${nintendoId} to Supabase User ${userId || stateObj.u}`);
    const supabase = getSupabaseClient();
    
    const { error } = await supabase
      .from("linked_accounts")
      .upsert({
        user_id: userId || stateObj.u,
        platform_name: "NINTENDO",
        provider_account_id: nintendoId,
        session_cookie: sessionToken,
        sync_status: "OK"
      }, { onConflict: "user_id, platform_name" });

    if (error) {
      console.error("Database upsert error:", error);
      throw error;
    }

    console.log("Nintendo link successful.");
    return new Response(JSON.stringify({ success: true, nintendoId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error("Nintendo Auth Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 400, // Use 400 for client errors to avoid "network failure" confusion
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
}

Deno.serve(async (req: Request) => {
  console.log(`Incoming request: ${req.method} ${req.url}`);
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    const url = new URL(req.url);
    let action = url.searchParams.get("action");
    let userId = url.searchParams.get("user_id");
    let body: any = null;

    // 1. Try to get action/userId from body for POST requests
    if (req.method === "POST") {
      const bodyText = await req.text();
      console.log(`Body preview: ${bodyText.substring(0, 100)}...`);
      if (bodyText) {
        try {
          body = JSON.parse(bodyText);
          action = action || body.action;
          userId = userId || body.user_id;
        } catch (e) {
          console.error("Failed to parse body JSON:", e.message);
        }
      }
    }

    // 2. Try to get action/userId from custom headers (fallback/legacy)
    const paramsHeader = req.headers.get("params");
    if (paramsHeader) {
      try {
        const params = JSON.parse(paramsHeader);
        action = action || params.action;
        userId = userId || params.user_id;
      } catch (e) { }
    }

    console.log(`Resolved action: ${action}, user_id: ${userId}`);

    if (action === "login") {
      const loginUrl = new URL(req.url);
      if (userId) loginUrl.searchParams.set("user_id", userId);
      return await handleLogin(loginUrl);
    } else if (action === "callback") {
      if (!body) throw new Error("Missing request body for callback");
      return await handleCallback(body);
    }

    return new Response(JSON.stringify({ error: `Invalid action: ${action}` }), { 
      status: 400, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  } catch (err: any) {
    console.error("Global Handler Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
