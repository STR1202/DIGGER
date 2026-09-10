import { partialShuffle, rngFrom } from './rng';
import { clusterOf, type GenreIndex } from './genres';
import type {
  Artist, DiggrMap, Entitlement, MapNode, SeedType, SimilarityRow, Tier, ViewType,
} from './types';

/** 確定枠に入る類似度の下限（基本設計書 FR-02。設定値として外出しし、リリース後も調整できる） */
export const CORE_THRESHOLD = 0.6;
/** 1 マップの上限ノード数 */
export const MAX_NODES = 100;

export const FREE_ENTITLEMENT: Entitlement = {
  plan: 'free', nodeLimit: 30, coreCap: 20, adsDisabled: false, expiresAt: null,
};
export const PRO_ENTITLEMENT: Omit<Entitlement, 'plan' | 'expiresAt'> = {
  nodeLimit: MAX_NODES, coreCap: 40, adsDisabled: true,
};

export interface BuildMapInput {
  readonly mapId: string;
  readonly seedType: SeedType;
  readonly seedKey: string;
  readonly seedName: string;
  readonly viewType: ViewType;
  readonly genreId: string | null;
  readonly entitlement: Entitlement;
  /** 検索時に選ぶオプション。false（既定）なら類似度順・人気順で決定的に並ぶ */
  readonly randomOn: boolean;
  readonly randomSeed: number;
  readonly parentMapId: string | null;
  readonly schemaVersion: string;
  readonly createdAt?: string;
  /** viewType='related' のとき: 類似度インデックス（スコア降順） */
  readonly similar?: readonly SimilarityRow[];
  /** viewType='genre' のとき: ジャンル所属アーティスト（popularity 降順） */
  readonly members?: readonly Artist[];
  /**
   * 同じジャンルの地図で「関連アーティストの地図にも出ている人」を後ろに回すための集合。
   * 関連で出てくる顔ぶれをそのまま並べても、軸を変えた意味がないため。
   */
  readonly knownMbids?: ReadonlySet<string>;
  readonly genreIndex?: GenreIndex;
}

function toNode(
  a: Artist, tier: Tier, rank: number,
  extra: { score?: number; relationTypes?: readonly MapNode['relationTypes'][number][]; cluster?: string; fresh?: boolean },
): MapNode {
  return {
    mbid: a.mbid,
    name: a.name,
    tier,
    rank,
    genres: a.genres,
    beginYear: a.beginYear,
    country: a.country,
    relationTypes: extra.relationTypes ?? [],
    ...(extra.score === undefined ? {} : { score: extra.score }),
    ...(extra.cluster === undefined ? {} : { cluster: extra.cluster }),
    ...(extra.fresh === undefined ? {} : { fresh: extra.fresh }),
  };
}

/**
 * 1 リクエスト = 1 マップ（FR-02 / FR-29）。
 * 確定枠は決定的、ランダム枠は乱数シードから完全に再現できる（FR-02b）。
 */
export function buildMap(input: BuildMapInput): DiggrMap {
  const { entitlement: ent, randomOn, randomSeed } = input;
  const viewType: ViewType = input.seedType === 'genre' ? 'genre' : input.viewType;
  const createdAt = input.createdAt ?? new Date().toISOString();

  let nodes: MapNode[] = [];
  let coreCount = 0;
  let canReroll = false;
  let available = 0;

  if (viewType === 'genre') {
    const members = input.members ?? [];
    const gid = input.genreId ?? input.seedKey;
    available = members.length;
    const known = input.knownMbids ?? new Set<string>();
    const fresh = members.filter((a) => !known.has(a.mbid));
    const seen = members.filter((a) => known.has(a.mbid));
    const pick = (arr: readonly Artist[], k: number, salt: number): Artist[] =>
      randomOn ? partialShuffle(arr, k, rngFrom(randomSeed + salt)) : arr.slice(0, k);
    const picked = [
      ...pick(fresh, ent.nodeLimit, 0),
      ...pick(seen, Math.max(0, ent.nodeLimit - fresh.length), 101),
    ];

    // サブジャンルの島にまとめ、島をまたいで順に出す（段階表示で全体の広がりが先に見える）
    const buckets = new Map<string, Artist[]>();
    for (const a of picked) {
      const c = input.genreIndex ? clusterOf(input.genreIndex, a.genres, gid) : gid;
      const list = buckets.get(c) ?? [];
      list.push(a);
      buckets.set(c, list);
    }
    const groups = [...buckets.entries()].sort((x, y) => y[1].length - x[1].length);
    const woven: { artist: Artist; cluster: string }[] = [];
    for (let i = 0; groups.some(([, list]) => list[i]); i++) {
      for (const [cluster, list] of groups) {
        const a = list[i];
        if (a) woven.push({ artist: a, cluster });
      }
    }
    nodes = woven.map(({ artist, cluster }, i) =>
      toNode(artist, 'random', i + 1, { cluster, fresh: !known.has(artist.mbid) }));
    canReroll = randomOn && members.length > ent.nodeLimit;
  } else {
    const items = input.similar ?? [];
    available = items.length;
    const coreAll = items.filter((x) => x.score >= CORE_THRESHOLD);
    const core = coreAll.slice(0, ent.coreCap);
    // クランプで溢れた確定枠は捨てず、プールの先頭に戻す（引ける候補として残す）
    const pool = [...coreAll.slice(core.length), ...items.filter((x) => x.score < CORE_THRESHOLD)];
    const slots = Math.max(0, ent.nodeLimit - core.length);
    const rest = randomOn ? partialShuffle(pool, slots, rngFrom(randomSeed)) : pool.slice(0, slots);
    coreCount = core.length;
    nodes = [
      ...core.map((x, i) => toNode(x.artist, 'core', i + 1, { score: x.score, relationTypes: x.relationTypes })),
      ...rest.map((x, i) => toNode(x.artist, 'random', core.length + i + 1, {
        score: x.score, relationTypes: x.relationTypes,
      })),
    ];
    canReroll = randomOn && pool.length > slots;
  }

  return {
    id: input.mapId,
    seedType: input.seedType,
    seedKey: input.seedKey,
    seedName: input.seedName,
    viewType,
    genreId: viewType === 'genre' ? (input.genreId ?? input.seedKey) : null,
    nodes,
    coreCount,
    ghosts: Math.max(0, Math.min(MAX_NODES - nodes.length, available - nodes.length)),
    canReroll,
    randomOn,
    randomSeed: randomOn ? randomSeed : 0,
    schemaVersion: input.schemaVersion,
    parentMapId: input.parentMapId,
    createdAt,
    nodeLimit: ent.nodeLimit,
  };
}

/** 段階表示（FR-28）の初期件数と 1 回あたりの増分 */
export const REVEAL_INITIAL = 10;
export const REVEAL_STEP = 10;

export function nextReveal(revealed: number, total: number, all = false): number {
  return all ? total : Math.min(total, revealed + REVEAL_STEP);
}

/**
 * 権利が変わったとき、引き直さずに同じマップを広げる（UC-02）。
 * いま見えているノードは順序ごと残し、増えた分だけ後ろに足す。
 */
export function expandMap(current: DiggrMap, fresh: DiggrMap): DiggrMap {
  const byId = new Map(fresh.nodes.map((n) => [n.mbid, n]));
  const keep = current.nodes.map((n) => byId.get(n.mbid) ?? n);
  const kept = new Set(keep.map((n) => n.mbid));
  const added = fresh.nodes.filter((n) => !kept.has(n.mbid));
  const cores = [...keep.filter((n) => n.tier === 'core'), ...added.filter((n) => n.tier === 'core')];
  const rands = [...keep.filter((n) => n.tier === 'random'), ...added.filter((n) => n.tier === 'random')];
  const nodes = [...cores, ...rands].slice(0, fresh.nodeLimit)
    .map((n, i) => ({ ...n, rank: i + 1 }));
  return {
    ...fresh,
    id: current.id,
    createdAt: current.createdAt,
    nodes,
    coreCount: Math.min(cores.length, nodes.length),
    ghosts: Math.max(0, Math.min(MAX_NODES - nodes.length, fresh.ghosts + fresh.nodes.length - nodes.length)),
  };
}
