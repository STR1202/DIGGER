/**
 * MusicBrainz コアデータのうち、取り込んでよいフィールドのホワイトリスト
 * （基本設計書 §3.5.6 項目 2「対象テーブルはホワイトリスト方式」）。
 *
 * `tags` / タグ由来の `genres` は CC BY-NC-SA 3.0 の補足データであり、
 * 有料サブスクリプションを持つ DIGGR では使えない（基本設計書 §3.2）。
 * ホワイトリスト方式にしておけば、「素朴に全フィールドを読むと混入する」という
 * 種類の事故を構造で防げる——新しいフィールドは自動では入らず、
 * 明示的にここへ追記した分だけが取り込まれる。
 */
export const ARTIST_ALLOWED_FIELDS = [
  'id', 'name', 'sort-name', 'aliases', 'country', 'life-span', 'relations', 'isni',
] as const;

export type AllowedArtistField = (typeof ARTIST_ALLOWED_FIELDS)[number];

/** ホワイトリストにタグ・ジャンル・レーティング由来のフィールドが紛れ込んでいないかの回帰検知。 */
const DENYLIST_HINTS = ['tag', 'genre', 'rating', 'annotation'] as const;

export function assertNoTagFields(fields: readonly string[]): void {
  for (const f of fields) {
    const lower = f.toLowerCase();
    const hit = DENYLIST_HINTS.find((d) => lower.includes(d));
    if (hit) throw new Error(`ingestion allowlist must not include tag-derived field "${f}" (matched "${hit}")`);
  }
}

/** ホワイトリスト外のキーを問答無用で落とす。CI テストと実パイプラインの両方から呼ぶ。 */
export function pickAllowed<T extends Record<string, unknown>>(
  record: T, allowed: readonly string[],
): Partial<T> {
  const out: Partial<T> = {};
  for (const key of allowed) {
    if (key in record) (out as Record<string, unknown>)[key] = record[key];
  }
  return out;
}
