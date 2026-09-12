/**
 * 疎通確認・小規模検証用の CLI（Phase 0、基本設計書 §11.1）。
 * 本番の一括取得（mbdump）とは別経路。実データを 1 件だけ MusicBrainz から取り、
 * allowlist を通して「タグ由来データが混ざっていないこと」を目視でも確認できるようにする。
 *
 * 使い方:
 *   MUSICBRAINZ_USER_AGENT="DiggrPipeline/0.1 (ops@example.com)" \
 *     npm run fetch:sample --workspace @diggr/pipeline -- "Radiohead"
 */
import { ARTIST_ALLOWED_FIELDS, pickAllowed } from '../allowlist';
import { searchArtistByName } from '../sources/musicbrainz';

async function main(): Promise<void> {
  const name = process.argv[2] ?? 'Radiohead';
  const userAgent = process.env['MUSICBRAINZ_USER_AGENT'];
  if (!userAgent) {
    console.error('MUSICBRAINZ_USER_AGENT を設定してください（基本設計書 §3.5.6 項目 3）');
    process.exit(1);
  }

  console.log(`fetching "${name}" from MusicBrainz...`);
  const raw = await searchArtistByName(name, userAgent);
  if (!raw) {
    console.error('not found');
    process.exit(1);
  }

  const picked = pickAllowed(raw as unknown as Record<string, unknown>, ARTIST_ALLOWED_FIELDS);
  console.log('raw fields:', Object.keys(raw));
  console.log('allowed fields kept:', Object.keys(picked));
  console.log('tags present in raw but dropped:', 'tags' in raw, '→ kept?', 'tags' in picked);
  console.log(JSON.stringify(picked, null, 2));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
