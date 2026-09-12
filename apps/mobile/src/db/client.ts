import * as SQLite from 'expo-sqlite';
import { migrate } from './schema';

const DB_NAME = 'diggr.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * 端末 DB を開いてマイグレーションを適用する。呼び出し側は待ってから使う
 * （`_layout.tsx` が起動時に 1 回 await し、以後はキャッシュされた接続を使い回す）。
 */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= (async () => {
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    await migrate(db);
    return db;
  })();
  return dbPromise;
}

/** 破損検知時の作り直し（基本設計書 R-39・SC-15）。ユーザーデータはサーバー側が正なので黙って作り直す。 */
export async function resetDb(): Promise<void> {
  dbPromise = null;
  await SQLite.deleteDatabaseAsync(DB_NAME);
  await getDb();
}

/** 起動時の整合性チェック。壊れていたら作り直す。 */
export async function initDb(): Promise<{ recovered: boolean }> {
  try {
    const db = await getDb();
    await db.getFirstAsync('SELECT 1');
    return { recovered: false };
  } catch {
    await resetDb();
    return { recovered: true };
  }
}
