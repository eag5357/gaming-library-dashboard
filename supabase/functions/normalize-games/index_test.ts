import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sanitizeTitle } from "./index.ts";

Deno.test("sanitizeTitle - removes common noise words", () => {
  const titles = [
    { input: "Resident Evil 4 Remastered", expected: "Resident Evil 4" },
    { input: "The Witcher 3: Wild Hunt GOTY Edition", expected: "The Witcher 3 Wild Hunt" },
    { input: "Destiny 2: Beyond Light (Friend's Pass)", expected: "Destiny 2 Beyond Light" },
    { input: "Cyberpunk 2077 - Definitive Edition", expected: "Cyberpunk 2077" },
  ];

  for (const { input, expected } of titles) {
    assertEquals(sanitizeTitle(input), expected);
  }
});

Deno.test("sanitizeTitle - handles diacritics", () => {
  const input = "Pokémon Scarlet";
  const expected = "Pokemon Scarlet";
  assertEquals(sanitizeTitle(input), expected);
});

Deno.test("sanitizeTitle - collapses spaces and removes special chars", () => {
  const input = "God of War: Ragnarök!!!";
  const expected = "God of War Ragnarok";
  assertEquals(sanitizeTitle(input), expected);
});
