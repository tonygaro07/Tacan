// E3-02 — roster integrity: unique ids/accents, and every portrait file exists
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHARACTERS, avatarUrl, characterById } from "../src/characters";

describe("E3-02 roster", () => {
  it("has 18 characters with unique ids and unique accent colors (design law)", () => {
    expect(CHARACTERS).toHaveLength(18);
    expect(new Set(CHARACTERS.map((c) => c.id)).size).toBe(18);
    expect(new Set(CHARACTERS.map((c) => c.accent)).size).toBe(18);
  });

  it("every character's face thumb and big portrait exist in public/avatars", () => {
    for (const c of CHARACTERS) {
      expect(existsSync(join(__dirname, "..", "public", "avatars", `${c.id}.png`)), `face ${c.id}`).toBe(true);
      expect(existsSync(join(__dirname, "..", "public", "avatars", "big", `${c.id}.png`)), `portrait ${c.id}`).toBe(true);
    }
  });

  it("lookup + url helpers behave", () => {
    expect(characterById("ricardo")?.player).toContain("PuristKiller");
    expect(characterById("zven")?.hostOnly).toBe(true);
    expect(characterById("nope")).toBeUndefined();
    expect(avatarUrl("karo")).toBe("/avatars/karo.png");
  });
});
