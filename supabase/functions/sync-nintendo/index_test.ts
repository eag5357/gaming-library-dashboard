import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { byteaToString } from "./index.ts";

Deno.test("byteaToString - Nintendo context - handles hex", () => {
  const input = "\\x54657374"; // "Test"
  assertEquals(byteaToString(input), "Test");
});

Deno.test("byteaToString - Nintendo context - handles empty", () => {
  assertEquals(byteaToString(""), null);
});
