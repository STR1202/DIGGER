/** ドメイン型。API のレスポンス（基本設計書 §8.4）とそのまま対応させる。 */

export type GenreCategory =
  | 'rock' | 'electronic' | 'hiphop' | 'jazz' | 'classical' | 'pop' | 'folk' | 'experimental';

/** 類似度の 5 信号（技術選定書 §4.3）。エッジの種類でもある。 */
export type RelationType = 'listen' | 'collab' | 'member' | 'influence' | 'label';

/** モックデータの共聴シグナル用のシーン識別子。本番では ListenBrainz の集計に置き換わる。 */
export type SeedScene =
  | 'uk-alt' | 'shoegaze' | 'idm' | 'techno' | 'triphop' | 'beats'
  | 'jazz' | 'minimal' | 'japan' | 'folk' | 'soul' | 'punk' | 'global';

export type Tier = 'core' | 'random';
export type ViewType = 'related' | 'genre';
export type SeedType = 'artist' | 'genre';
export type Plan = 'free' | 'pro_monthly' | 'pro_yearly';

export interface Genre {
  readonly id: string;
  readonly name: string;
  readonly category: GenreCategory;
  readonly parent: string | null;
  readonly children: readonly string[];
}

export interface Artist {
  readonly mbid: string;
  readonly name: string;
  readonly country: string | null;
  readonly beginYear: number | null;
  readonly endYear: number | null;
  /** 代表度 0.0–1.0（リスナー数の対数正規化） */
  readonly popularity: number;
  readonly genres: readonly string[];
}

/** 類似度インデックスの 1 行（artist_similarity 相当） */
export interface SimilarityRow {
  readonly artist: Artist;
  readonly score: number;
  readonly relationTypes: readonly RelationType[];
}

export interface MapNode {
  readonly mbid: string;
  readonly name: string;
  readonly tier: Tier;
  /** 確定枠のみ。ランダム枠に順位の場はないので返さない（§8.4） */
  readonly score?: number;
  readonly rank: number;
  readonly relationTypes: readonly RelationType[];
  readonly genres: readonly string[];
  readonly beginYear: number | null;
  readonly country: string | null;
  /** 同じジャンルの地図で、どのサブジャンルの島に属するか */
  readonly cluster?: string;
  /** 関連アーティストの地図には出てこなかった顔ぶれか */
  readonly fresh?: boolean;
}

export interface DiggrMap {
  readonly id: string;
  readonly seedType: SeedType;
  readonly seedKey: string;
  readonly seedName: string;
  readonly viewType: ViewType;
  readonly genreId: string | null;
  readonly nodes: readonly MapNode[];
  /** 先頭から何件が確定枠か（境界の描画と権利判定に使う） */
  readonly coreCount: number;
  /** 未解放（ゴースト）の件数 */
  readonly ghosts: number;
  readonly canReroll: boolean;
  readonly randomOn: boolean;
  readonly randomSeed: number;
  readonly schemaVersion: string;
  readonly parentMapId: string | null;
  readonly createdAt: string;
  readonly nodeLimit: number;
}

export interface Entitlement {
  readonly plan: Plan;
  readonly nodeLimit: number;
  readonly coreCap: number;
  readonly adsDisabled: boolean;
  readonly expiresAt: string | null;
}

export interface Point { x: number; y: number }

export interface LaidOutNode extends MapNode {
  x: number;
  y: number;
  /** 描画半径 */
  r: number;
  /** ラベル幅（レイアウト時に実測した値。ラベル同士を離すのに使う） */
  labelWidth: number;
  label: string;
}

export interface Island {
  readonly id: string;
  readonly name: string;
  readonly category: GenreCategory;
  readonly x: number;
  readonly y: number;
  /** 島の半径（霞と輪郭の描画に使う） */
  readonly r: number;
  readonly count: number;
  /** この島の最初のノードが nodes 配列の何番目か（段階表示の判定に使う） */
  readonly firstIndex: number;
}

export interface Layout {
  readonly nodes: readonly LaidOutNode[];
  readonly ghosts: readonly Point[];
  readonly islands: readonly Island[];
  /** 中心からいちばん遠いノードまでの距離 */
  readonly extent: number;
}
