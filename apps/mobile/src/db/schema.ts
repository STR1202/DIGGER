/**
 * 端末データストア（expo-sqlite）のスキーマ（基本設計書 §7.4.2、技術選定書 §3.5.2）。
 * `PRAGMA user_version` でマイグレーションを管理する。バージョンを上げるときは
 * `MIGRATIONS` に新しい関数を追記するだけでよい（既存の番号は変更しない）。
 */
import type { SQLiteDatabase } from 'expo-sqlite';

export const SCHEMA_VERSION = 1;

const V1 = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS maps (
  id             TEXT PRIMARY KEY,
  seed_type      TEXT NOT NULL,
  seed_key       TEXT NOT NULL,
  seed_name      TEXT NOT NULL,
  view_type      TEXT NOT NULL,
  genre_id       TEXT,
  core_count     INTEGER NOT NULL,
  random_seed    TEXT NOT NULL,
  random_on      INTEGER NOT NULL,
  revealed_count INTEGER NOT NULL,
  schema_version TEXT NOT NULL,
  parent_map_id  TEXT,
  created_at     INTEGER NOT NULL,
  last_opened_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS maps_last_opened ON maps (last_opened_at DESC);
CREATE INDEX IF NOT EXISTS maps_seed ON maps (seed_key, view_type, seed_type, created_at DESC);

CREATE TABLE IF NOT EXISTS map_nodes (
  map_id    TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
  idx       INTEGER NOT NULL,
  uid       TEXT NOT NULL,
  name      TEXT NOT NULL,
  tier      TEXT NOT NULL,
  score     REAL,
  relations TEXT,
  PRIMARY KEY (map_id, idx)
);
CREATE INDEX IF NOT EXISTS map_nodes_uid ON map_nodes (uid);

CREATE TABLE IF NOT EXISTS bookmarks (
  id           TEXT PRIMARY KEY,
  target_type  TEXT NOT NULL,
  target_key   TEXT NOT NULL,
  target_name  TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  synced       INTEGER NOT NULL DEFAULT 0,
  UNIQUE (target_type, target_key)
);

CREATE TABLE IF NOT EXISTS checked (
  uid        TEXT PRIMARY KEY,
  checked_at INTEGER NOT NULL,
  synced     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS listened (
  uid          TEXT NOT NULL,
  service      TEXT NOT NULL,
  listened_at  INTEGER NOT NULL,
  synced       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (uid, service)
);

CREATE TABLE IF NOT EXISTS artists_cache (
  uid        TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  aliases    TEXT,
  country    TEXT,
  begin_year INTEGER,
  popularity REAL,
  genres     TEXT,
  links      TEXT,
  has_graph  INTEGER NOT NULL,
  cached_at  INTEGER NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS artists_fts USING fts5(
  name, aliases, content='artists_cache', content_rowid='rowid', tokenize='trigram'
);

CREATE TRIGGER IF NOT EXISTS artists_cache_ai AFTER INSERT ON artists_cache BEGIN
  INSERT INTO artists_fts(rowid, name, aliases) VALUES (new.rowid, new.name, new.aliases);
END;
CREATE TRIGGER IF NOT EXISTS artists_cache_ad AFTER DELETE ON artists_cache BEGIN
  INSERT INTO artists_fts(artists_fts, rowid, name, aliases) VALUES ('delete', old.rowid, old.name, old.aliases);
END;
CREATE TRIGGER IF NOT EXISTS artists_cache_au AFTER UPDATE ON artists_cache BEGIN
  INSERT INTO artists_fts(artists_fts, rowid, name, aliases) VALUES ('delete', old.rowid, old.name, old.aliases);
  INSERT INTO artists_fts(rowid, name, aliases) VALUES (new.rowid, new.name, new.aliases);
END;

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
`;

/** バージョン番号 → そこへ上げるための DDL。1 始まりで連番、隙間を作らない。 */
const MIGRATIONS: Record<number, string> = {
  1: V1,
};

/**
 * `PRAGMA user_version` を見て、足りない分だけ順に適用する。
 * 起動のたびに呼んで問題ない（IF NOT EXISTS なので冪等）。
 */
export async function migrate(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < SCHEMA_VERSION) {
    const next = version + 1;
    const ddl = MIGRATIONS[next];
    if (!ddl) throw new Error(`missing migration for version ${next}`);
    await db.execAsync(ddl);
    await db.execAsync(`PRAGMA user_version = ${next}`);
    version = next;
  }
}
