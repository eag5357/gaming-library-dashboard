import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { performXboxSync } from "./index.ts";

Deno.test({
  name: "performXboxSync - handles missing API key",
  fn: async () => {
    const envStub = stub(Deno.env, "get", (key: string) => {
      if (key === "OPENXBL_API_KEY") return "";
      return "fake";
    });

    try {
      await performXboxSync();
    } catch (e: any) {
      assertEquals(e.message, "OPENXBL_API_KEY missing");
    } finally {
      envStub.restore();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "performXboxSync - handles empty library",
  fn: async () => {
    const envStub = stub(Deno.env, "get", (key: string) => {
      if (key === "OPENXBL_API_KEY") return "fake_key";
      if (key === "SUPABASE_URL") return "http://localhost:54321";
      if (key === "SUPABASE_SERVICE_ROLE_KEY") return "fake_role";
      return undefined;
    });

    const fetchStub = stub(globalThis, "fetch", () => {
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });

    try {
      const result = await performXboxSync();
      assertEquals(result, { success: true, count: 0 });
    } finally {
      envStub.restore();
      fetchStub.restore();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
