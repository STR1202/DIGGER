import { cosine, genreVector, type GenreIndex } from './genres';
import { hash01 } from './rng';
import type { Artist, RelationType, SimilarityRow } from './types';

/**
 * 類似度の 5 信号（技術選定書 §4.3）。
 *
 * 本番では月次パイプラインが artist_similarity / artist_pool を作るので、
 * 実行時にここを通ることはない。この実装は
 *   1) 開発・デモ用のデータソース
 *   2) パイプラインの重み係数を変えたときの回帰テストの基準
 * として置いてある。重みは設定値として外に出し、再計算だけで調整できるようにする。
 */
export const WEIGHTS: Readonly<Record<RelationType, number>> = {
  listen: 0.5,
  genre: 0.2,
  collab: 0.15,
  influence: 0.1,
  label: 0.05,
} as unknown as Readonly<Record<RelationType, number>>;

export interface SimilaritySource {
  readonly genreIndex: GenreIndex;
  /** シーン親和（共聴シグナルの代理） */
  readonly sceneAffinity: (a: string, b: string) => number;
  /** 明示的な関係（MusicBrainz / Discogs / Wikidata 由来） */
  readonly relationsOf: (aMbid: string, bMbid: string) => readonly RelationType[];
  readonly sceneOf: (mbid: string) => string;
}

const eraOverlap = (a: Artist, b: Artist): number => {
  const ae = a.endYear ?? 2026;
  const be = b.endYear ?? 2026;
  const o = Math.min(ae, be) - Math.max(a.beginYear ?? 1900, b.beginYear ?? 1900);
  return o <= 0 ? 0 : Math.min(1, o / 25);
};

export function similarity(a: Artist, b: Artist, src: SimilaritySource): {
  score: number; relationTypes: RelationType[];
} {
  const types = src.relationsOf(a.mbid, b.mbid);
  const listen =
    src.sceneAffinity(src.sceneOf(a.mbid), src.sceneOf(b.mbid)) *
      (0.62 + 0.38 * hash01(a.mbid, b.mbid)) *
      (0.55 + 0.45 * Math.min(a.popularity, b.popularity)) +
    (types.length ? 0.18 : 0);
  const genre = cosine(
    genreVector(src.genreIndex, a.genres),
    genreVector(src.genreIndex, b.genres),
  );
  const collab = types.includes('member') ? 1 : types.includes('collab') ? 0.82 : 0;
  const influence = types.includes('influence') ? 1 : 0;
  const label = types.includes('label') ? 1 : eraOverlap(a, b) * 0.5;

  const raw =
    0.5 * Math.min(1, listen) + 0.2 * genre + 0.15 * collab + 0.1 * influence + 0.05 * label;

  const relationTypes: RelationType[] = [];
  if (listen >= 0.34) relationTypes.push('listen');
  for (const t of types) if (!relationTypes.includes(t)) relationTypes.push(t);
  if (relationTypes.length === 0) relationTypes.push('listen');

  return { score: Math.min(0.99, raw * 1.34), relationTypes };
}

/** シードに対する類似度を全件計算し、スコア降順で返す（本番では DB の 1 クエリに相当） */
export function similarTo(
  seed: Artist, all: readonly Artist[], src: SimilaritySource,
): SimilarityRow[] {
  const rows: SimilarityRow[] = [];
  for (const b of all) {
    if (b.mbid === seed.mbid) continue;
    const { score, relationTypes } = similarity(seed, b, src);
    rows.push({ artist: b, score, relationTypes });
  }
  rows.sort((x, y) => y.score - x.score);
  return rows;
}
