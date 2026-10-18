/**
 * Seeded, deterministic RNG. xmur3 hashes the seed string into four 32-bit
 * words that feed sfc32. `fork(name)` derives an independent stream from
 * `seed + "/" + name`, so sub-streams are stable no matter how much the parent
 * stream has been consumed.
 */
import type { Rng } from "./types";

/** xmur3 string hash: returns a function producing successive 32-bit hashes. */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** sfc32: small fast counter PRNG, 128-bit state, period ~2^128. */
function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** Create a deterministic Rng from a seed string. */
export function createRng(seed: string): Rng {
  const h = xmur3(seed);
  const next = sfc32(h(), h(), h(), h());
  // Warm up: discard a few outputs so near-identical seeds diverge quickly.
  for (let i = 0; i < 8; i++) next();
  const rng: Rng = {
    next,
    int(min: number, max: number): number {
      if (!Number.isFinite(min) || !Number.isFinite(max)) throw new Error("rng.int: bounds must be finite");
      const lo = Math.ceil(Math.min(min, max));
      const hi = Math.floor(Math.max(min, max));
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    fork(name: string): Rng {
      return createRng(`${seed}/${name}`);
    },
  };
  return rng;
}
