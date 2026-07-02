// ---------------------------------------------------------------------------
// E3-02 — the Ivalice: Ninth Shard roster (the Friday Raid crew, from the
// character bible). Purely cosmetic: an avatar never touches gameplay.
// Portraits live in /public/avatars (face thumbs) and /public/avatars/big.
// ---------------------------------------------------------------------------

export interface Character {
  id: string;
  name: string;
  player: string;   // the real friend behind the character
  classTag: string;
  accent: string;   // unique per character — the accent IS the character
  hostOnly?: boolean;
}

export const CHARACTERS: Character[] = [
  { id: "karo",         name: "Karo",         player: "Karo",                 classTag: "Sorcerer · The Crimson Scholar",   accent: "#b07cff" },
  { id: "arctic",       name: "Arctic",       player: "Arctic",               classTag: "Bowman · Glacier-Sworn",           accent: "#7ec8ff" },
  { id: "cold",         name: "Cold",         player: "Cold",                 classTag: "Cleric · The Mute Cleric",         accent: "#f4e3a8" },
  { id: "lexx",         name: "Lexx",         player: "Lexx",                 classTag: "Ninja · Four-Stroke Doctrine",     accent: "#5ee9ff" },
  { id: "crisman",      name: "Crisman",      player: "Crisman",              classTag: "Gunner · Merchant Coda",           accent: "#ffa05c" },
  { id: "leox",         name: "Leox",         player: "Leox",                 classTag: "Paladin · Butterfly Clause",       accent: "#7cb8ff" },
  { id: "ramastol",     name: "Ramastol",     player: "Ramastol",             classTag: "Warlock · Weekly Resonance",       accent: "#c764ff" },
  { id: "judas",        name: "Judas",        player: "Judas",                classTag: "Dark Enchanter · Wild-Card",       accent: "#6e1f2e" },
  { id: "oscar",        name: "Oscar",        player: "Oscar",                classTag: "Rune-Delver · Cipher",             accent: "#4ade80" },
  { id: "alwaysabunny", name: "Alwaysabunny", player: "Alwaysabunny",         classTag: "Dreamleaf Druid · Haze",           accent: "#ff9ec6" },
  { id: "jason",        name: "Jason",        player: "Jason",                classTag: "Wax-Cantor · Groove",              accent: "#6366f1" },
  { id: "jean",         name: "Jean",         player: "Jean",                 classTag: "Stray-Sworn Paladin · Vow",        accent: "#14b8a6" },
  { id: "akima",        name: "Akima",        player: "Akima",                classTag: "Hearth-Bard · Mise",               accent: "#f97316" },
  { id: "rick",         name: "Rick",         player: "Rick",                 classTag: "Tactician · Insight",              accent: "#3b82f6" },
  { id: "graci",        name: "Graci",        player: "Graci",                classTag: "War-Priest · Grace",               accent: "#ec4899" },
  { id: "teo",          name: "Teo",          player: "Teo",                  classTag: "Far-Wandering Bruiser · Fury",     accent: "#64748b" },
  { id: "ricardo",      name: "Ricardo",      player: "Ricardo / PuristKiller", classTag: "Frost-Troll · Toll",             accent: "#22d3ee" },
  { id: "zven",         name: "Zven",         player: "Tony (host)",          classTag: "Shadowmaster · GM",                accent: "#e23a4e", hostOnly: true },
];

export const characterById = (id: string | null | undefined): Character | undefined =>
  CHARACTERS.find((c) => c.id === id);

export const avatarUrl = (id: string): string => `/avatars/${id}.png`;
export const portraitUrl = (id: string): string => `/avatars/big/${id}.png`;
