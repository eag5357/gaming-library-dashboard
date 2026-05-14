import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { handleLogin, handleCallback } from "./index.ts";

Deno.test("auth-xbox handleLogin redirects to Microsoft", async () => {
  const envStub = stub(Deno.env, "get", (key: string) => {
    if (key === "AZURE_CLIENT_ID") return "fake_client_id";
    if (key === "SUPABASE_URL") return "http://localhost:54321";
    return undefined;
  });

  try {
    const url = new URL("http://localhost/functions/v1/auth-xbox?action=login&user_id=123");
    const res = await handleLogin(url);
    
    assertEquals(res.status, 302);
    const location = res.headers.get("Location") || "";
    assertEquals(location.includes("login.microsoftonline.com"), true);
    assertEquals(location.includes("state=123"), true);
  } finally {
    envStub.restore();
  }
});

Deno.test("auth-xbox handleCallback verifies and links account", async () => {
  const envStub = stub(Deno.env, "get", (key: string) => {
    if (key === "SUPABASE_URL") return "http://localhost:54321";
    if (key === "SUPABASE_SERVICE_ROLE_KEY") return "fake_role";
    if (key === "AZURE_CLIENT_ID") return "fake_client_id";
    if (key === "AZURE_CLIENT_SECRET") return "fake_secret";
    return undefined;
  });

  const url = new URL("http://localhost/functions/v1/auth-xbox?action=callback&code=fake_code&state=123");
  
  const fetchStub = stub(globalThis, "fetch", (input: string | URL | Request) => {
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    
    if (urlStr.includes("oauth2/v2.0/token")) {
      return Promise.resolve(new Response(JSON.stringify({ access_token: "ms_token" }), { status: 200 }));
    }
    if (urlStr.includes("user.auth.xboxlive.com/user/authenticate")) {
      return Promise.resolve(new Response(JSON.stringify({ Token: "xbl_token" }), { status: 200 }));
    }
    if (urlStr.includes("xsts.auth.xboxlive.com/xsts/authorize")) {
      return Promise.resolve(new Response(JSON.stringify({ DisplayClaims: { xui: [{ xid: "123456789" }] } }), { status: 200 }));
    }
    // Supabase upsert
    return Promise.resolve(new Response(JSON.stringify({}), { status: 201 }));
  });

  try {
    const res = await handleCallback(url);
    assertEquals(res.status, 302);
    assertEquals(res.headers.get("Location"), "http://localhost:5173/?auth=success&platform=xbox");
  } finally {
    fetchStub.restore();
    envStub.restore();
  }
});
