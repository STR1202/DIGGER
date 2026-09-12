/**
 * MusicBrainz Web Service（`ws/2`）からの少量取得。
 *
 * 本番の月次パイプラインは PostgreSQL コアデータダンプ（`mbdump`）を使うので、
 * 実行時にここを通ることはない（基本設計書 §3.5.2・§6.2.1）。この関数は
 * Phase 0 の疎通確認・小規模な差分確認・このリポジトリのデモ用に、
 * 公開 Web Service を少量だけ叩く経路として置く。
 *
 * MusicBrainz の利用条件（User-Agent に連絡先を入れる、§3.5.6 項目 3）を満たすため、
 * 呼び出し側は必ず具体的な連絡先を含む User-Agent を渡すこと。
 * レートは 1 リクエスト/秒を超えないこと（同ステップの「差分確認のみ」）。
 */
const BASE = 'https://musicbrainz.org/ws/2';

export interface MbArtistRaw {
  readonly id: string;
  readonly name: string;
  readonly 'sort-name': string;
  readonly country?: string;
  readonly 'life-span'?: { begin?: string; end?: string; ended?: boolean };
  readonly aliases?: readonly { name: string; locale: string | null }[];
  readonly relations?: readonly { type: string; url?: { resource: string } }[];
  /** 取得はするが取り込まない（CC BY-NC-SA 3.0）。allowlist.ts の pickAllowed で必ず落とす。 */
  readonly tags?: readonly { name: string; count: number }[];
}

function assertContactableUserAgent(userAgent: string): void {
  if (!userAgent.includes('@') && !userAgent.includes('http')) {
    throw new Error(
      'MusicBrainz User-Agent には連絡先（メールまたは URL）を含めること（基本設計書 §3.5.6 項目 3）',
    );
  }
}

export async function fetchArtist(mbid: string, userAgent: string): Promise<MbArtistRaw> {
  assertContactableUserAgent(userAgent);
  const url = `${BASE}/artist/${mbid}?fmt=json&inc=aliases+url-rels+tags`;
  const res = await fetch(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`MusicBrainz request failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as MbArtistRaw;
}

export async function searchArtistByName(name: string, userAgent: string): Promise<MbArtistRaw | null> {
  assertContactableUserAgent(userAgent);
  const url = `${BASE}/artist/?query=${encodeURIComponent(`artist:"${name}"`)}&fmt=json&limit=1`;
  const res = await fetch(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`MusicBrainz search failed: ${res.status}`);
  const body = (await res.json()) as { artists?: MbArtistRaw[] };
  return body.artists?.[0] ?? null;
}
