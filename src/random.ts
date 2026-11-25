export type Random = () => number;

/** Mulberry32 PRNG. */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 4294967296);
}

export function between(random: Random, min: number, max: number): number {
  return min + random() * (max - min);
}

export function wholeTurns(random: Random, max: number): number {
  const turns = 1 + Math.floor(random() * max);
  return random() < 0.5 ? -turns : turns;
}
