import type { DiggrMap, Entitlement, SeedType, ViewType } from '@diggr/core';

export interface SearchHit {
  readonly type: 'artist' | 'genre';
  readonly key: string;
  readonly name: string;
  readonly subtitle: string;
}

export interface CreateMapRequest {
  readonly seedType: SeedType;
  readonly seedKey: string;
  readonly viewType: ViewType;
  readonly genreId?: string | null;
  /** 検索時に選ぶランダム表示のオン・オフ（既定は false） */
  readonly randomOn: boolean;
  readonly parentMapId?: string | null;
}

export interface GenreFacet {
  readonly id: string;
  readonly name: string;
  readonly count: number;
  readonly depth: number;
  readonly hasChildren: boolean;
}

export interface SyncPayload {
  readonly bookmarks: { targetType: 'artist' | 'genre' | 'map'; targetKey: string; targetName: string; createdAt: string }[];
  readonly checked: { uid: string; checkedAt: string }[];
  readonly listened: { uid: string; service: string; listenedAt: string }[];
}

/** アプリから見た API。HTTP 実装とローカル実装の両方がこれを満たす。 */
export interface DiggrApi {
  search(query: string): Promise<SearchHit[]>;
  createMap(req: CreateMapRequest): Promise<DiggrMap>;
  getMap(mapId: string): Promise<DiggrMap>;
  reroll(mapId: string): Promise<DiggrMap>;
  entitlement(): Promise<Entitlement>;
  /** リワード広告視聴による一時解放（§9.3） */
  claimReward(): Promise<Entitlement>;
  /** 外部音楽アプリへ遷移したアーティストの記録（FR-23） */
  markListened(mbid: string): Promise<void>;
  genreFacets(mapId: string): Promise<GenreFacet[]>;
  /** 端末に溜まった未同期の操作をサーバーへ送る（`POST /me/sync`、技術選定書 §3.5.3） */
  sync(pending: SyncPayload): Promise<{ accepted: number }>;
  /** アカウントと全データの削除（`DELETE /me`） */
  deleteAccount(): Promise<void>;
}
