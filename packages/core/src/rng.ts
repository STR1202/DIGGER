/**
 * 決定的な乱数（ADR-19）。
 * Math.random() はシードを固定できず検証もできないので使わない。
 * 同じシードなら、いつどこで実行しても同じマップが再現される。
 */
export type Rng = () => number;

const rotl = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0;

/** xoshiro128** */
export function rngFrom(seed: number): Rng {
  let s0 = (seed >>> 0) || 1;
  let s1 = (Math.imul(seed, 2654435761) >>> 0) || 2;
  let s2 = ((seed ^ 0x9e3779b9) >>> 0) || 3;
  let s3 = (((seed << 7) ^ 0x85ebca6b) >>> 0) || 4;
  return () => {
    const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (s1 << 9) >>> 0;
    s2 ^= s0;
    s3 ^= s1;
    s1 ^= s2;
    s0 ^= s3;
    s2 ^= t;
    s3 = rotl(s3, 11);
    return result / 4294967296;
  };
}

/**
 * 部分 Fisher-Yates。先頭 k 件だけ確定させれば十分なので O(k)。
 * 重みは付けない（付けると結局人気順に寄り、ランダム枠の意味が消える）。
 */
export function partialShuffle<T>(input: readonly T[], k: number, rnd: Rng): T[] {
  const a = input.slice();
  const n = Math.min(k, a.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rnd() * (a.length - i));
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a.slice(0, n);
}

/** 文字列から安定した 0–1 の値（レイアウトの初期角度など、見た目の再現性のために使う） */
export function hash01(...parts: string[]): number {
  const s = parts.join('|');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

export function newRandomSeed(): number {
  return Math.floor(Math.random() * 2147483647) >>> 0;
}
