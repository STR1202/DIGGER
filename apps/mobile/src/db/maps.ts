import type { DiggrMap } from '@diggr/core';
import { getDb } from './client';

/** 履歴・ブックマークの一覧表示に使う行（基本設計書 §7.4.2 `maps` + `map_nodes` の集約）。 */
export interface MapRecord {
  readonly id: string;
  readonly seedType: DiggrMap['seedType'];
  readonly seedKey: string;
  readonly seedName: string;
  readonly viewType: DiggrMap['viewType'];
  readonly genreId: string | null;
  readonly nodeUids: readonly string[];
  readonly coreCount: number;
  readonly randomSeed: string;
  readonly randomOn: boolean;
  readonly schemaVersion: string;
  readonly parentMapId: string | null;
  readonly createdAt: string;
  readonly lastOpenedAt: string;
  readonly revealed: number;
}

interface MapRow {
  id: string; seed_type: string; seed_key: string; seed_name: string; view_type: string;
  genre_id: string | null; core_count: number; random_seed: string; random_on: number;
  revealed_count: number; schema_version: string; parent_map_id: string | null;
  created_at: number; last_opened_at: number;
}

function toRecord(row: MapRow, nodeUids: readonly string[]): MapRecord {
  return {
    id: row.id,
    seedType: row.seed_type as DiggrMap['seedType'],
    seedKey: row.seed_key,
    seedName: row.seed_name,
    viewType: row.view_type as DiggrMap['viewType'],
    genreId: row.genre_id,
    nodeUids,
    coreCount: row.core_count,
    randomSeed: row.random_seed,
    randomOn: row.random_on === 1,
    schemaVersion: row.schema_version,
    parentMapId: row.parent_map_id,
    createdAt: new Date(row.created_at).toISOString(),
    lastOpenedAt: new Date(row.last_opened_at).toISOString(),
    revealed: row.revealed_count,
  };
}

/** マップを保存する。既にあれば `revealed`・`last_opened_at` だけ更新する（ノード集合は不変・ADR-18）。 */
export async function saveMap(map: DiggrMap, revealed: number): Promise<void> {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ id: string }>('SELECT id FROM maps WHERE id = ?', [map.id]);
  const now = Date.now();
  if (existing) {
    await db.runAsync(
      'UPDATE maps SET revealed_count = ?, last_opened_at = ? WHERE id = ?',
      [revealed, now, map.id],
    );
    return;
  }
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO maps
        (id, seed_type, seed_key, seed_name, view_type, genre_id, core_count, random_seed,
         random_on, revealed_count, schema_version, parent_map_id, created_at, last_opened_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        map.id, map.seedType, map.seedKey, map.seedName, map.viewType, map.genreId,
        map.coreCount, String(map.randomSeed), map.randomOn ? 1 : 0, revealed,
        map.schemaVersion, map.parentMapId, now, now,
      ],
    );
    for (let i = 0; i < map.nodes.length; i++) {
      const n = map.nodes[i]!;
      await db.runAsync(
        'INSERT INTO map_nodes (map_id, idx, uid, name, tier, score, relations) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [map.id, i, n.mbid, n.name, n.tier, n.score ?? null, JSON.stringify(n.relationTypes)],
      );
    }
  });
}

export async function touchMap(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE maps SET last_opened_at = ? WHERE id = ?', [Date.now(), id]);
}

export async function updateRevealed(id: string, revealed: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE maps SET revealed_count = ? WHERE id = ?', [revealed, id]);
}

async function withNodes(db: Awaited<ReturnType<typeof getDb>>, row: MapRow): Promise<MapRecord> {
  const nodes = await db.getAllAsync<{ uid: string }>(
    'SELECT uid FROM map_nodes WHERE map_id = ? ORDER BY idx ASC', [row.id],
  );
  return toRecord(row, nodes.map((n) => n.uid));
}

export type HistoryOrder = 'created_at' | 'last_opened_at' | 'node_count';

/** マイディグ一覧（SC-11）。v3.1 で追加した並べ替え・検索に対応する。 */
export async function listHistory(opts: {
  limit?: number; order?: HistoryOrder; query?: string;
} = {}): Promise<MapRecord[]> {
  const db = await getDb();
  const order = opts.order ?? 'created_at';
  const orderSql = order === 'last_opened_at'
    ? 'm.last_opened_at DESC'
    : order === 'node_count'
      ? '(SELECT COUNT(*) FROM map_nodes WHERE map_id = m.id) DESC'
      : 'm.created_at DESC';

  const q = opts.query?.trim();
  const rows = q
    ? await db.getAllAsync<MapRow>(
      `SELECT DISTINCT m.* FROM maps m
         LEFT JOIN map_nodes n ON n.map_id = m.id
        WHERE m.seed_name LIKE '%' || ? || '%' OR n.name LIKE '%' || ? || '%'
        ORDER BY ${orderSql} LIMIT ?`,
      [q, q, opts.limit ?? 1000],
    )
    : await db.getAllAsync<MapRow>(
      `SELECT * FROM maps m ORDER BY ${orderSql} LIMIT ?`, [opts.limit ?? 1000],
    );
  return Promise.all(rows.map((r) => withNodes(db, r)));
}

export async function getMapRecord(id: string): Promise<MapRecord | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<MapRow>('SELECT * FROM maps WHERE id = ?', [id]);
  return row ? withNodes(db, row) : null;
}

/** 表示タイプ切替の復帰（UC-03）。同一シード×表示タイプの最新を引き当てる。 */
export async function findLatestBySeed(
  seedKey: string, viewType: string, seedType: string,
): Promise<MapRecord | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<MapRow>(
    `SELECT * FROM maps WHERE seed_key = ? AND view_type = ? AND seed_type = ?
      ORDER BY created_at DESC LIMIT 1`,
    [seedKey, viewType, seedType],
  );
  return row ? withNodes(db, row) : null;
}

/** 端末の保持上限（60 件・LRU）。ブックマーク済みのマップは対象外にする。 */
export async function pruneHistory(keep = 60): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `DELETE FROM maps WHERE id IN (
       SELECT id FROM maps
        WHERE id NOT IN (SELECT target_key FROM bookmarks WHERE target_type = 'map')
        ORDER BY last_opened_at DESC
        LIMIT -1 OFFSET ?
     )`,
    [keep],
  );
}

/** 履歴の全削除（ブックマーク済みは残す）。設定画面 SC-12。 */
export async function clearHistory(): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `DELETE FROM maps WHERE id NOT IN (SELECT target_key FROM bookmarks WHERE target_type = 'map')`,
  );
}

/** アカウントと全データの削除。ブックマークの有無に関わらず全消去する。 */
export async function wipeAllMaps(): Promise<void> {
  const db = await getDb();
  await db.execAsync('DELETE FROM maps; DELETE FROM map_nodes;');
}
