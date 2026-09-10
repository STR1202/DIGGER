import type { Genre } from './types';

export type GenreIndex = ReadonlyMap<string, Genre>;

export function buildGenreIndex(
  rows: readonly { id: string; name: string; category: string; parent: string | null }[],
): GenreIndex {
  const children = new Map<string, string[]>();
  for (const r of rows) {
    if (r.parent) {
      const list = children.get(r.parent) ?? [];
      list.push(r.id);
      children.set(r.parent, list);
    }
  }
  const index = new Map<string, Genre>();
  for (const r of rows) {
    index.set(r.id, {
      id: r.id,
      name: r.name,
      category: r.category as Genre['category'],
      parent: r.parent,
      children: children.get(r.id) ?? [],
    });
  }
  return index;
}

/** そのジャンルから根までの経路（自分を含む） */
export function ancestors(index: GenreIndex, id: string): string[] {
  const out: string[] = [];
  let cur: string | null = id;
  while (cur) {
    out.push(cur);
    cur = index.get(cur)?.parent ?? null;
  }
  return out;
}

export function depth(index: GenreIndex, id: string): number {
  return ancestors(index, id).length;
}

/** アーティストのジャンル集合を、親までたどって重み付きで展開する（タグベクトルの代理） */
export function genreVector(index: GenreIndex, genres: readonly string[]): Map<string, number> {
  const v = new Map<string, number>();
  genres.forEach((g, i) => {
    const w = 1 - i * 0.18;
    let cur: string | null = g;
    let k = 1;
    while (cur) {
      v.set(cur, (v.get(cur) ?? 0) + w * k);
      cur = index.get(cur)?.parent ?? null;
      k *= k === 1 ? 0.5 : 0.6;
    }
  });
  return v;
}

export function cosine(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [k, x] of a) {
    na += x * x;
    const y = b.get(k);
    if (y) dot += x * y;
  }
  for (const [, y] of b) nb += y * y;
  const d = Math.sqrt(na * nb);
  return d === 0 ? 0 : dot / d;
}

/**
 * gid の中で、そのアーティストがいちばん具体的にどこに属するか。
 * 同じジャンルの地図を「サブジャンルの島」に組むときの割り当てに使う。
 */
export function clusterOf(index: GenreIndex, artistGenres: readonly string[], gid: string): string {
  let best: string | null = null;
  let bestDepth = -1;
  for (const g of artistGenres) {
    const chain = ancestors(index, g);
    const i = chain.indexOf(gid);
    if (i >= 0 && i > bestDepth) {
      bestDepth = i;
      best = g;
    }
  }
  return best ?? gid;
}
