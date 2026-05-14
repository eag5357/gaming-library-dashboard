import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { handleLogin, handleCallback } from "./index.ts";

Deno.test("auth-nintendo handleLogin returns authUrl and state", async () => {
  const url = new URL("http://localhost/functions/v1/auth-nintendo?action=login&user_id=123");
  const res = await handleLogin(url);
  
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.authUrl.includes("accounts.nintendo.com"), true);
  assertEquals(data.state !== undefined, true);
});

Deno.test("auth-nintendo handleCallback verifies and links account", async () => {
  const envStub = stub(Deno.env, "get", (key: string) => {
    if (key === "SUPABASE_URL") return "http://localhost:54321";
    if (key === "SUPABASE_SERVICE_ROLE_KEY") return "fake_role";
    return undefined;
  });

  const stateObj = { v: "fake_verifier", u: "123", t: Date.now() };
  const state = btoa(JSON.stringify(stateObj));
  const link = "npf54789befb391a838://auth#session_token_code=fake_code";

  const fetchStub = stub(globalThis, "fetch", (input: string | URL | Request) => {
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    
    if (urlStr.includes("api/session_token")) {
      return Promise.resolve(new Response(JSON.stringify({ session_token: "session_token" }), { status: 200 }));
    }
    if (urlStr.includes("api/token")) {
      return Promise.resolve(new Response(JSON.stringify({ access_token: "access_token" }), { status: 200 }));
    }
    if (urlStr.includes("users/me")) {
      return Promise.resolve(new Response(JSON.stringify({ id: "nintendo_123" }), { status: 200 }));
    }
    // Supabase upsert
    return Promise.resolve(new Response(JSON.stringify({}), { status: 201 }));
  });

  try {
    const res = await handleCallback(link, state, "123");
    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.success, true);
    assertEquals(data.nintendoId, "nintendo_123");
  } finally {
    fetchStub.restore();
    envStub.restore();
  }
});
