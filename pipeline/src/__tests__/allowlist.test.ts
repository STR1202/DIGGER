import { describe, expect, it } from 'vitest';
import { ARTIST_ALLOWED_FIELDS, assertNoTagFields, pickAllowed } from '../allowlist';

/**
 * 商用利用チェック（基本設計書 §3.5.6 項目 2、本番リリース計画書 G3・§2.5）。
 * 「ドキュメントに書いてあるから守られる」ではなく、ここが赤くならない限り
 * タグ由来データは混ざらない、という構造で担保する。
 */
describe('ingestion allowlist（MusicBrainz タグ由来データの排除）', () => {
  it('現行のホワイトリストに tag/genre/rating 系のフィールドを含まない', () => {
    expect(() => assertNoTagFields(ARTIST_ALLOWED_FIELDS)).not.toThrow();
  });

  it('タグ由来のフィールドを足そうとすると検知する（回帰テスト）', () => {
    expect(() => assertNoTagFields([...ARTIST_ALLOWED_FIELDS, 'tags'])).toThrow(/tag/);
    expect(() => assertNoTagFields([...ARTIST_ALLOWED_FIELDS, 'genres'])).toThrow(/genre/);
  });

  it('pickAllowed はホワイトリスト外のキー（tags・rating を含む）を落とす', () => {
    const raw = {
      id: 'a74b1b7f-71a5-4011-9441-d0b5e4122711',
      name: 'Radiohead',
      'sort-name': 'Radiohead',
      tags: [{ name: 'alternative rock', count: 42 }],
      rating: { value: 5, 'votes-count': 100 },
    };
    const picked = pickAllowed(raw, ARTIST_ALLOWED_FIELDS);
    expect(picked).toEqual({ id: raw.id, name: 'Radiohead', 'sort-name': 'Radiohead' });
    expect('tags' in picked).toBe(false);
    expect('rating' in picked).toBe(false);
  });
});
