// Deterministic, pure RNG (mulberry32). The seed lives in GameState and
// advances on every draw — same seed in, same game out. This is what makes
// E1-10's "full scripted game" test reproducible.

export function nextRand(seed: number): [value: number, nextSeed: number] {
  const s = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, s];
}

export function randInt(seed: number, maxExclusive: number): [value: number, nextSeed: number] {
  const [v, s] = nextRand(seed);
  return [Math.floor(v * maxExclusive), s];
}

export function rollDie(seed: number): [value: number, nextSeed: number] {
  const [v, s] = randInt(seed, 6);
  return [v + 1, s];
}

/** Fisher–Yates. Returns a new array; input untouched. */
export function shuffle<T>(arr: readonly T[], seed: number): [shuffled: T[], nextSeed: number] {
  const out = arr.slice();
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    let j: number;
    [j, s] = randInt(s, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return [out, s];
}
