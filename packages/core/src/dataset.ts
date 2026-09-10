import { buildGenreIndex, type GenreIndex } from './genres';
import { MOCK_ARTISTS, MOCK_GENRES, MOCK_RELATIONS, SCENE_AFFINITY } from './data/mock';
import { similarTo, type SimilaritySource } from './similarity';
import type { Artist, RelationType, SimilarityRow } from './types';

/**
 * 開発・デモ用のインメモリ・データセット。
 * 本番の API は同じ形のインターフェイス（MusicRepository）を PostgreSQL で実装する。
 */
export interface MusicRepository {
  getArtist(mbid: string): Promise<Artist | null>;
  findArtistByName(name: string): Promise<Artist | null>;
  searchArtists(query: string, limit: number): Promise<Artist[]>;
  searchGenres(query: string, limit: number): Promise<{ id: string; name: string; count: number }[]>;
  /** 類似度上位（確定枠＋プール）。本番は artist_similarity + artist_pool の 2 テーブル */
  similarTo(mbid: string, limit: number): Promise<SimilarityRow[]>;
  /** ジャンル所属アーティスト（popularity 降順） */
  genreMembers(genreId: string, limit: number): Promise<Artist[]>;
  genreIndex(): Promise<GenreIndex>;
  schemaVersion(): string;
}

const relKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

export class MockRepository implements MusicRepository {
  private readonly index: GenreIndex;
  private readonly artists: Artist[];
  private readonly scenes = new Map<string, string>();
  private readonly relations = new Map<string, RelationType[]>();
  private readonly src: SimilaritySource;
  private readonly cache = new Map<string, SimilarityRow[]>();

  constructor() {
    this.index = buildGenreIndex(MOCK_GENRES);
    this.artists = MOCK_ARTISTS.map((a) => ({
      mbid: a.mbid, name: a.name, country: a.country,
      beginYear: a.beginYear, endYear: a.endYear,
      popularity: a.popularity, genres: a.genres,
    }));
    for (const a of MOCK_ARTISTS) this.scenes.set(a.mbid, a.scene);
    for (const [x, y, t] of MOCK_RELATIONS) {
      const k = relKey(x, y);
      const list = this.relations.get(k) ?? [];
      list.push(t);
      this.relations.set(k, list);
    }
    this.src = {
      genreIndex: this.index,
      sceneOf: (mbid) => this.scenes.get(mbid) ?? '',
      sceneAffinity: (a, b) =>
        a === b ? 1 : (SCENE_AFFINITY[a < b ? `${a}|${b}` : `${b}|${a}`] ?? 0.1),
      relationsOf: (a, b) => this.relations.get(relKey(a, b)) ?? [],
    };
  }

  schemaVersion(): string { return 'mock_v1'; }

  async getArtist(mbid: string): Promise<Artist | null> {
    return this.artists.find((a) => a.mbid === mbid) ?? null;
  }

  async findArtistByName(name: string): Promise<Artist | null> {
    return this.artists.find((a) => a.name === name) ?? null;
  }

  async searchArtists(query: string, limit: number): Promise<Artist[]> {
    const q = query.toLowerCase();
    return this.artists
      .filter((a) => a.name.toLowerCase().includes(q))
      .sort((x, y) => y.popularity - x.popularity)
      .slice(0, limit);
  }

  async searchGenres(query: string, limit: number) {
    const q = query.toLowerCase();
    const out: { id: string; name: string; count: number }[] = [];
    for (const g of this.index.values()) {
      if (!g.name.toLowerCase().includes(q)) continue;
      const count = (await this.genreMembers(g.id, 10_000)).length;
      if (count > 0) out.push({ id: g.id, name: g.name, count });
    }
    return out.sort((a, b) => b.count - a.count).slice(0, limit);
  }

  async similarTo(mbid: string, limit: number): Promise<SimilarityRow[]> {
    const cached = this.cache.get(mbid);
    if (cached) return cached.slice(0, limit);
    const seed = await this.getArtist(mbid);
    if (!seed) return [];
    const rows = similarTo(seed, this.artists, this.src);
    this.cache.set(mbid, rows);
    return rows.slice(0, limit);
  }

  async genreMembers(genreId: string, limit: number): Promise<Artist[]> {
    const belongs = (a: Artist): boolean =>
      a.genres.some((g) => {
        let cur: string | null = g;
        while (cur) {
          if (cur === genreId) return true;
          cur = this.index.get(cur)?.parent ?? null;
        }
        return false;
      });
    return this.artists.filter(belongs)
      .sort((x, y) => y.popularity - x.popularity)
      .slice(0, limit);
  }

  async genreIndex(): Promise<GenreIndex> { return this.index; }
}
