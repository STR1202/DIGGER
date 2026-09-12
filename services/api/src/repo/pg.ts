import { Pool } from 'pg';
import { buildGenreIndex, type Artist, type GenreIndex, type MusicRepository, type RelationType, type SimilarityRow } from '@diggr/core';

/**
 * 本番のデータソース。
 * 月次パイプラインが作る music_v{n} スキーマを読むだけで、書き込みはしない。
 * search_path を差し替えるだけで新旧スキーマを切り替えられる（ADR-09'）。
 */
export class PgRepository implements MusicRepository {
  private index: GenreIndex | null = null;

  constructor(
    private readonly pool: Pool,
    private readonly schema: string,
  ) {}

  schemaVersion(): string { return this.schema; }

  private async q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const client = await this.pool.connect();
    try {
      await client.query(`SET LOCAL search_path TO ${this.schema}, public`);
      const res = await client.query(sql, params);
      return res.rows as T[];
    } finally {
      client.release();
    }
  }

  private static toArtist(r: Record<string, unknown>): Artist {
    return {
      mbid: String(r['mbid']),
      name: String(r['name']),
      country: (r['country'] as string | null) ?? null,
      beginYear: (r['begin_year'] as number | null) ?? null,
      endYear: (r['end_year'] as number | null) ?? null,
      popularity: Number(r['popularity'] ?? 0),
      genres: (r['genres'] as string[] | null) ?? [],
      hasGraph: Boolean(r['has_graph'] ?? true),
    };
  }

  async getArtist(mbid: string): Promise<Artist | null> {
    const rows = await this.q<Record<string, unknown>>(
      `SELECT a.*, (SELECT array_agg(ag.genre_id ORDER BY ag.weight DESC)
                      FROM artist_genres ag WHERE ag.mbid = a.mbid) AS genres
         FROM artists a WHERE a.mbid = $1`, [mbid]);
    return rows[0] ? PgRepository.toArtist(rows[0]) : null;
  }

  async findArtistByName(name: string): Promise<Artist | null> {
    const rows = await this.q<Record<string, unknown>>(
      `SELECT a.*, (SELECT array_agg(ag.genre_id ORDER BY ag.weight DESC)
                      FROM artist_genres ag WHERE ag.mbid = a.mbid) AS genres
         FROM artists a WHERE a.name = $1 ORDER BY a.popularity DESC LIMIT 1`, [name]);
    return rows[0] ? PgRepository.toArtist(rows[0]) : null;
  }

  /** pg_trgm の GIN 索引を使った部分一致（FR-01）。別名（aliases）も対象にする。 */
  async searchArtists(query: string, limit: number): Promise<Artist[]> {
    const rows = await this.q<Record<string, unknown>>(
      `SELECT a.*, (SELECT array_agg(ag.genre_id ORDER BY ag.weight DESC)
                      FROM artist_genres ag WHERE ag.mbid = a.mbid) AS genres
         FROM artists a
        WHERE a.name ILIKE '%' || $1 || '%'
           OR EXISTS (SELECT 1 FROM unnest(a.aliases) al WHERE al ILIKE '%' || $1 || '%')
        ORDER BY (a.name ILIKE $1 || '%') DESC, a.popularity DESC
        LIMIT $2`, [query, limit]);
    return rows.map(PgRepository.toArtist);
  }

  async searchGenres(query: string, limit: number) {
    const rows = await this.q<Record<string, unknown>>(
      `SELECT id, name, artist_count FROM genres
        WHERE name ILIKE '%' || $1 || '%'
        ORDER BY artist_count DESC LIMIT $2`, [query, limit]);
    return rows.map((r) => ({
      id: String(r['id']), name: String(r['name']), count: Number(r['artist_count'] ?? 0),
    }));
  }

  /**
   * 確定枠は artist_similarity（行）、ランダム枠のプールは artist_pool（uuid 配列）。
   * 二層に分けているのは、全件を行で持つと 12 億行・70GB になるため（ADR-17）。
   */
  async similarTo(mbid: string, limit: number): Promise<SimilarityRow[]> {
    const rows = await this.q<Record<string, unknown>>(
      `SELECT s.dst_mbid, s.score, s.relation_types,
              a.name, a.country, a.begin_year, a.end_year, a.popularity,
              (SELECT array_agg(ag.genre_id ORDER BY ag.weight DESC)
                 FROM artist_genres ag WHERE ag.mbid = a.mbid) AS genres
         FROM artist_similarity s JOIN artists a ON a.mbid = s.dst_mbid
        WHERE s.src_mbid = $1
        ORDER BY s.rank ASC
        LIMIT $2`, [mbid, limit]);
    const core: SimilarityRow[] = rows.map((r) => ({
      artist: PgRepository.toArtist({ ...r, mbid: r['dst_mbid'] }),
      score: Number(r['score']),
      relationTypes: (r['relation_types'] as RelationType[] | null) ?? [],
    }));
    if (core.length >= limit) return core;

    const pool = await this.q<Record<string, unknown>>(
      `SELECT a.*, (SELECT array_agg(ag.genre_id ORDER BY ag.weight DESC)
                      FROM artist_genres ag WHERE ag.mbid = a.mbid) AS genres
         FROM artist_pool p
         JOIN LATERAL unnest(p.pool_mbids) WITH ORDINALITY AS u(mbid, ord) ON true
         JOIN artists a ON a.mbid = u.mbid
        WHERE p.src_mbid = $1
        ORDER BY u.ord
        LIMIT $2`, [mbid, limit - core.length]);
    return [
      ...core,
      ...pool.map((r) => ({
        artist: PgRepository.toArtist(r),
        // プールは順位もスコアも描画に使わないので、閾値未満であることだけ示す
        score: 0,
        relationTypes: [] as RelationType[],
      })),
    ];
  }

  async genreMembers(genreId: string, limit: number): Promise<Artist[]> {
    const rows = await this.q<Record<string, unknown>>(
      `WITH RECURSIVE sub AS (
         SELECT $1::text AS id
         UNION ALL
         SELECT h.child_id FROM genre_hierarchy h JOIN sub ON h.parent_id = sub.id
       )
       SELECT DISTINCT a.*, (SELECT array_agg(ag2.genre_id ORDER BY ag2.weight DESC)
                               FROM artist_genres ag2 WHERE ag2.mbid = a.mbid) AS genres
         FROM artist_genres ag
         JOIN artists a ON a.mbid = ag.mbid
        WHERE ag.genre_id IN (SELECT id FROM sub)
        ORDER BY a.popularity DESC
        LIMIT $2`, [genreId, limit]);
    return rows.map(PgRepository.toArtist);
  }

  async genreIndex(): Promise<GenreIndex> {
    if (this.index) return this.index;
    const rows = await this.q<Record<string, unknown>>(
      `SELECT g.id, g.name, g.category, h.parent_id
         FROM genres g LEFT JOIN genre_hierarchy h ON h.child_id = g.id AND h.depth = 1`);
    this.index = buildGenreIndex(rows.map((r) => ({
      id: String(r['id']), name: String(r['name']), category: String(r['category']),
      parent: (r['parent_id'] as string | null) ?? null,
    })));
    return this.index;
  }
}
