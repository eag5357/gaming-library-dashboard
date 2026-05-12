import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { byteaToString } from "./index.ts";

Deno.test("byteaToString - handles hex-string (Postgres bytea format)", () => {
  const input = "\\x48656c6c6f"; // "Hello" in hex
  const expected = "Hello";
  assertEquals(byteaToString(input), expected);
});

Deno.test("byteaToString - handles Uint8Array", () => {
  const input = new TextEncoder().encode("World");
  const expected = "World";
  assertEquals(byteaToString(input), expected);
});

Deno.test("byteaToString - handles null/undefined", () => {
  assertEquals(byteaToString(null), null);
  assertEquals(byteaToString(undefined), null);
});
