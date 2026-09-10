import { buildGenreIndex, MOCK_GENRES, type GenreIndex } from '@diggr/core';
import type { GenreColorKey } from '../theme/tokens';

/**
 * ジャンルの分類表。
 * 語彙はアプリのバージョンに紐づく静的データとして持ち、
 * 本番では起動時に GET /genres で取得したものをキャッシュして差し替える
 * （ID は月次パイプラインをまたいで安定しているため、表示名の更新だけで足りる）。
 */
export const genreIndex: GenreIndex = buildGenreIndex(MOCK_GENRES);

export const genreName = (id: string): string => genreIndex.get(id)?.name ?? id;

export const categoryOf = (id: string): GenreColorKey =>
  (genreIndex.get(id)?.category ?? 'pop') as GenreColorKey;

/** 表示中のノードから、ジャンルごとの件数を親までたどって集計する（SC-07 / FR-08） */
export interface Facet {
  readonly id: string;
  readonly name: string;
  readonly count: number;
  readonly depth: number;
  readonly parent: string | null;
  readonly hasChildren: boolean;
}

export function facetsOf(nodes: readonly { genres: readonly string[] }[]): Facet[] {
  const counts = new Map<string, number>();
  for (const n of nodes) {
    const seen = new Set<string>();
    for (const g of n.genres) {
      let cur: string | null = g;
      while (cur) {
        if (!seen.has(cur)) {
          seen.add(cur);
          counts.set(cur, (counts.get(cur) ?? 0) + 1);
        }
        cur = genreIndex.get(cur)?.parent ?? null;
      }
    }
  }
  const facets: Facet[] = [];
  for (const [id, count] of counts) {
    const g = genreIndex.get(id);
    if (!g) continue;
    let depth = 1;
    let cur = g.parent;
    while (cur) { depth += 1; cur = genreIndex.get(cur)?.parent ?? null; }
    facets.push({
      id, count, depth,
      name: g.name,
      parent: g.parent,
      hasChildren: g.children.some((c) => counts.has(c)),
    });
  }
  return facets.sort((a, b) => b.count - a.count);
}
