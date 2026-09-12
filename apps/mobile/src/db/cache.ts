import type { MapNode } from '@diggr/core';
import { getDb } from './client';

/** アーティストのキャッシュ（オフライン検索・SC-15 用）。FTS5 trigram で部分一致を引く。 */
export interface CachedArtist {
  readonly uid: string;
  readonly name: string;
  readonly country: string | null;
  readonly beginYear: number | null;
  readonly popularity: number;
  readonly genres: readonly string[];
  readonly hasGraph: boolean;
}

/** マップを開いたときにそのノードをキャッシュへ流し込む（技術選定書 §3.5.5: 「見た人が地図に残る」）。 */
export async function cacheNodes(nodes: readonly MapNode[]): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    for (const n of nodes) {
      await db.runAsync(
        `INSERT INTO artists_cache (uid, name, aliases, country, begin_year, popularity, genres, links, has_graph, cached_at)
         VALUES (?, ?, NULL, ?, ?, NULL, ?, NULL, 1, ?)
         ON CONFLICT(uid) DO UPDATE SET name = excluded.name, cached_at = excluded.cached_at`,
        [n.mbid, n.name, n.country, n.beginYear, JSON.stringify(n.genres), now],
      );
    }
  });
}

/** オフライン検索（FR-01 / SC-15）。ネットが無いときだけ使う縮退経路。 */
export async function searchOffline(query: string, limit = 12): Promise<CachedArtist[]> {
  const db = await getDb();
  const q = query.trim();
  if (!q) return [];
  const rows = await db.getAllAsync<{
    uid: string; name: string; country: string | null; begin_year: number | null;
    popularity: number | null; genres: string | null; has_graph: number;
  }>(
    `SELECT c.* FROM artists_fts f
       JOIN artists_cache c ON c.rowid = f.rowid
      WHERE artists_fts MATCH ?
      ORDER BY c.popularity DESC
      LIMIT ?`,
    [q.replace(/["]/g, ''), limit],
  );
  return rows.map((r) => ({
    uid: r.uid, name: r.name, country: r.country, beginYear: r.begin_year,
    popularity: r.popularity ?? 0, genres: r.genres ? JSON.parse(r.genres) as string[] : [],
    hasGraph: r.has_graph === 1,
  }));
}

/** スキーマ更新時はキャッシュだけ破棄する。`maps` は残す（R-39 / §7.4.3）。 */
export async function clearArtistsCache(): Promise<void> {
  const db = await getDb();
  await db.execAsync('DELETE FROM artists_cache;');
}
