import { hash01 } from './rng';
import type { GenreIndex } from './genres';
import type { DiggrMap, Island, LaidOutNode, Layout, Point } from './types';

export interface LayoutOptions {
  /** ラベル幅の実測関数（RN では Skia/RN Text の計測、サーバーでは概算） */
  measureLabel: (text: string) => number;
  /** 力学計算の反復回数。ノードが多いときは自動で減らす */
  iterations?: number;
}

const R0 = 150;
const LABEL_MAX = 15;

export const labelOf = (name: string): string =>
  name.length > LABEL_MAX ? `${name.slice(0, LABEL_MAX - 1)}…` : name;

/**
 * 地図のレイアウト。
 * - 関連アーティスト: 確定枠を内側、その続きを外側に置いた 1 つの力学レイアウト
 * - 同じジャンル: サブジャンルごとの「島」に組み替える（形そのものを変えて別の地図に見せる）
 * どちらも、ラベルの幅を見込んで文字同士が重ならない距離まで押し広げる。
 */
export function layoutMap(map: DiggrMap, opts: LayoutOptions, genreIndex?: GenreIndex): Layout {
  const nodes: LaidOutNode[] = map.nodes.map((n) => {
    const label = labelOf(n.name);
    return { ...n, label, labelWidth: opts.measureLabel(label), x: 0, y: 0, r: 7 };
  });
  const base = hash01(map.seedKey, map.viewType) * Math.PI * 2;
  const layout = map.viewType === 'genre'
    ? layoutIslands(nodes, base, map, genreIndex, opts)
    : layoutRadial(nodes, base, opts);
  return layout;
}

function relax(
  nodes: LaidOutNode[],
  iterations: number,
  pull: (n: LaidOutNode) => void,
  minCenter: number,
  labelFactor: number,
): void {
  for (let k = 0; k < iterations; k++) {
    for (const n of nodes) pull(n);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i]!;
        const b = nodes[j]!;
        const dxMin = a.r + b.r + 9 + (a.labelWidth + b.labelWidth) * labelFactor;
        const dyMin = a.r + b.r + 19;
        const nx = (b.x - a.x) / dxMin;
        const ny = (b.y - a.y) / dyMin;
        const d = Math.hypot(nx, ny);
        if (d < 1) {
          const p = (1 - d) * 0.5;
          const ux = (nx / (d || 0.001)) * dxMin * p;
          const uy = (ny / (d || 0.001)) * dyMin * p;
          a.x -= ux; a.y -= uy; b.x += ux; b.y += uy;
        }
      }
    }
    for (const n of nodes) {
      const d = Math.hypot(n.x, n.y) || 0.01;
      if (d < minCenter) { n.x *= minCenter / d; n.y *= minCenter / d; }
    }
  }
}

function layoutRadial(nodes: LaidOutNode[], base: number, opts: LayoutOptions): Layout {
  const core = nodes.filter((n) => n.tier === 'core');
  const rands = nodes.filter((n) => n.tier === 'random');
  const rankOf = new Map(rands.map((n, i) => [n.mbid, i]));
  const scores = core.map((n) => n.score ?? 0);
  const smax = Math.max(0.01, ...scores);
  const smin = Math.min(0, ...scores);
  const inner = core.length ? R0 * 0.74 : 60;
  const targets = new Map<string, number>();

  nodes.forEach((n, i) => {
    let target: number;
    if (n.tier === 'core') {
      const t = ((n.score ?? 0) - smin) / (smax - smin || 1);
      target = 62 + (1 - t) * (inner - 62);
      n.r = 7 + 9 * t;
    } else {
      const k = (rankOf.get(n.mbid) ?? 0) / Math.max(1, rands.length - 1);
      target = inner * 0.88 + k * R0 * 0.74 + (hash01('rr', String(i)) - 0.5) * 20;
      n.r = 6.4 - 1.6 * k;
    }
    targets.set(n.mbid, target);
    const ang = base + i * 2.39996;
    n.x = Math.cos(ang) * target;
    n.y = Math.sin(ang) * target;
  });

  relax(nodes, opts.iterations ?? (nodes.length > 60 ? 150 : 240), (n) => {
    const d = Math.hypot(n.x, n.y) || 0.001;
    const f = ((targets.get(n.mbid) ?? d) - d) * 0.08;
    n.x += (n.x / d) * f;
    n.y += (n.y / d) * f;
  }, 54, 0.26);

  return finish(nodes, base, [], nodesExtent(nodes));
}

function layoutIslands(
  nodes: LaidOutNode[], base: number, map: DiggrMap,
  genreIndex: GenreIndex | undefined, opts: LayoutOptions,
): Layout {
  const ids = [...new Set(nodes.map((n) => n.cluster ?? map.genreId ?? ''))];
  const groups = ids
    .map((id) => ({ id, items: nodes.filter((n) => (n.cluster ?? map.genreId) === id) }))
    .sort((a, b) => b.items.length - a.items.length);
  const centers = new Map<string, Point>();

  groups.forEach((g, i) => {
    const ang = base + (i / groups.length) * Math.PI * 2;
    const spread = Math.sqrt(g.items.length) * 16 + 18;
    const rr = 140 + spread * 0.7 + (i % 2) * 30;
    const cx = Math.cos(ang) * rr;
    const cy = Math.sin(ang) * rr;
    centers.set(g.id, { x: cx, y: cy });
    g.items.forEach((n, k) => {
      const a2 = base + k * 2.39996;
      const r2 = Math.sqrt(k + 0.6) * 15;
      n.r = 6.6;
      n.x = cx + Math.cos(a2) * r2;
      n.y = cy + Math.sin(a2) * r2;
    });
  });

  relax(nodes, opts.iterations ?? 170, (n) => {
    const c = centers.get(n.cluster ?? map.genreId ?? '');
    if (!c) return;
    n.x += (c.x - n.x) * 0.045;
    n.y += (c.y - n.y) * 0.045;
  }, 70, 0.24);

  const islands: Island[] = groups.map((g) => {
    const cx = g.items.reduce((s, n) => s + n.x, 0) / g.items.length;
    const cy = g.items.reduce((s, n) => s + n.y, 0) / g.items.length;
    const r = g.items.reduce((m, n) => Math.max(m, Math.hypot(n.x - cx, n.y - cy) + n.r), 0) + 18;
    const genre = genreIndex?.get(g.id);
    return {
      id: g.id,
      name: genre?.name ?? g.id,
      category: genre?.category ?? 'pop',
      x: cx, y: cy, r,
      count: g.items.length,
      firstIndex: nodes.indexOf(g.items[0]!),
    };
  });

  return finish(nodes, base, islands, nodesExtent(nodes));
}

const nodesExtent = (nodes: readonly LaidOutNode[]): number =>
  nodes.reduce((m, n) => Math.max(m, Math.hypot(n.x, n.y) + n.r), 90);

function finish(nodes: LaidOutNode[], base: number, islands: Island[], extent: number): Layout {
  return { nodes, ghosts: [], islands, extent };
}

/** 未解放（ゴースト）は地図の外側に散らす。数だけ分かればよいので位置は決定的でよい。 */
export function ghostPoints(count: number, extent: number, seedKey: string): Point[] {
  const base = hash01(seedKey, 'ghost') * Math.PI * 2;
  const out: Point[] = [];
  for (let i = 0; i < count; i++) {
    const ang = base + i * 2.39996;
    const rr = extent * (1.1 + 0.34 * (((i * 7) % 13) / 13));
    out.push({ x: Math.cos(ang) * rr, y: Math.sin(ang) * rr });
  }
  return out;
}

/** 全体が画面に収まる倍率 */
export function fitScale(extent: number, width: number, height: number): number {
  return Math.max(0.55, Math.min(1.25, Math.min(width * 0.46, height * 0.33) / extent));
}
