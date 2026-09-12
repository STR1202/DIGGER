import { getDb } from './client';

/** ブックマーク・チェック済み・聴いた記録（FR-16 / FR-31 / FR-23）。
 * いずれも `synced = 0` で端末に書き、`/me/sync` でサーバーへ送ったら 1 に立てる（技術選定書 §3.5.3）。 */

export interface Bookmark {
  readonly id: string;
  readonly targetType: 'artist' | 'genre' | 'map';
  readonly targetKey: string;
  readonly targetName: string;
  readonly createdAt: string;
}

export async function listBookmarks(): Promise<Bookmark[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string; target_type: string; target_key: string; target_name: string; created_at: number;
  }>('SELECT * FROM bookmarks ORDER BY created_at DESC');
  return rows.map((r) => ({
    id: r.id,
    targetType: r.target_type as Bookmark['targetType'],
    targetKey: r.target_key,
    targetName: r.target_name,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export async function isBookmarked(targetType: Bookmark['targetType'], targetKey: string): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync(
    'SELECT 1 FROM bookmarks WHERE target_type = ? AND target_key = ?', [targetType, targetKey],
  );
  return row !== null;
}

export async function bookmarkCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM bookmarks');
  return row?.c ?? 0;
}

/** 追加できたら true、上限などで断念したら false（呼び出し側で判定してから呼ぶ）。 */
export async function addBookmark(
  targetType: Bookmark['targetType'], targetKey: string, targetName: string,
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR IGNORE INTO bookmarks (id, target_type, target_key, target_name, created_at, synced)
     VALUES (?, ?, ?, ?, ?, 0)`,
    [`${targetType}:${targetKey}`, targetType, targetKey, targetName, Date.now()],
  );
}

export async function removeBookmark(targetType: Bookmark['targetType'], targetKey: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM bookmarks WHERE target_type = ? AND target_key = ?', [targetType, targetKey]);
}

export async function listChecked(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ uid: string }>('SELECT uid FROM checked');
  return rows.map((r) => r.uid);
}

/** シートを開いた時点でチェック済みにする（FR-31）。アーティスト単位、どのマップからでも引き継ぐ。 */
export async function markChecked(uid: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR IGNORE INTO checked (uid, checked_at, synced) VALUES (?, ?, 0)', [uid, Date.now()],
  );
}

export async function listListened(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ uid: string }>('SELECT DISTINCT uid FROM listened');
  return rows.map((r) => r.uid);
}

export async function markListened(uid: string, service: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR IGNORE INTO listened (uid, service, listened_at, synced) VALUES (?, ?, ?, 0)',
    [uid, service, Date.now()],
  );
  await markChecked(uid);
}

export async function wipeInteractions(): Promise<void> {
  const db = await getDb();
  await db.execAsync('DELETE FROM bookmarks; DELETE FROM checked; DELETE FROM listened;');
}

/** `/me/sync` へ送る未同期分（技術選定書 §3.5.3: Last-Write-Wins、同期後に synced=1 を立てる）。 */
export interface PendingSync {
  bookmarks: { targetType: string; targetKey: string; targetName: string; createdAt: string }[];
  checked: { uid: string; checkedAt: string }[];
  listened: { uid: string; service: string; listenedAt: string }[];
}

export async function collectPendingSync(): Promise<PendingSync> {
  const db = await getDb();
  const [bookmarks, checked, listened] = await Promise.all([
    db.getAllAsync<{ target_type: string; target_key: string; target_name: string; created_at: number }>(
      'SELECT target_type, target_key, target_name, created_at FROM bookmarks WHERE synced = 0',
    ),
    db.getAllAsync<{ uid: string; checked_at: number }>('SELECT uid, checked_at FROM checked WHERE synced = 0'),
    db.getAllAsync<{ uid: string; service: string; listened_at: number }>(
      'SELECT uid, service, listened_at FROM listened WHERE synced = 0',
    ),
  ]);
  return {
    bookmarks: bookmarks.map((b) => ({
      targetType: b.target_type, targetKey: b.target_key, targetName: b.target_name,
      createdAt: new Date(b.created_at).toISOString(),
    })),
    checked: checked.map((c) => ({ uid: c.uid, checkedAt: new Date(c.checked_at).toISOString() })),
    listened: listened.map((l) => ({
      uid: l.uid, service: l.service, listenedAt: new Date(l.listened_at).toISOString(),
    })),
  };
}

export async function markSynced(): Promise<void> {
  const db = await getDb();
  await db.execAsync(
    'UPDATE bookmarks SET synced = 1 WHERE synced = 0;'
    + 'UPDATE checked SET synced = 1 WHERE synced = 0;'
    + 'UPDATE listened SET synced = 1 WHERE synced = 0;',
  );
}
