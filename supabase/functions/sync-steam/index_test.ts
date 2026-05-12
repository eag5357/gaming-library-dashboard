import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { performSteamSync } from "./index.ts";

// This is a more complex test because it involves mocking global fetch and Deno.env
// For a true "unit" test, we'd refactor the index.ts to be more dependency-injection friendly.
// However, we can still test the logic by mocking the global environment.

Deno.test({
  name: "performSteamSync - handles empty accounts list",
  fn: async () => {
    // Mock Deno.env
    const envStub = stub(Deno.env, "get", (key: string) => {
      if (key === "STEAM_API_KEY") return "fake_key";
      if (key === "SUPABASE_URL") return "http://localhost:54321";
      if (key === "SUPABASE_SERVICE_ROLE_KEY") return "fake_role";
      return undefined;
    });

    // Mock fetch to simulate Supabase returning no accounts
    const fetchStub = stub(globalThis, "fetch", () => {
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });

    try {
      const result = await performSteamSync();
      assertEquals(result, { message: "No accounts" });
    } finally {
      envStub.restore();
      fetchStub.restore();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
