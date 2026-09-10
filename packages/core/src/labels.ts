import type { Island, LaidOutNode } from './types';

export interface Rect { x: number; y: number; w: number; h: number }

export interface LabelPlacement {
  readonly mbid: string;
  /** 画面座標。ラベルは倍率に依らず一定の大きさで描く */
  readonly x: number;
  readonly y: number;
  readonly text: string;
}

export interface PlaceLabelsInput {
  readonly nodes: readonly LaidOutNode[];
  readonly islands: readonly Island[];
  /** 描画中のノード数（段階表示） */
  readonly revealed: number;
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly width: number;
  readonly height: number;
  /** 中心（シード）が占める矩形。ここには何も置かない */
  readonly reserved: readonly Rect[];
  readonly isExcluded?: (n: LaidOutNode) => boolean;
  readonly isGenreView: boolean;
  readonly selected?: string | null;
}

const overlaps = (a: Rect, b: Rect): boolean =>
  !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);

/**
 * ラベルの場所決め。
 * 画面座標で判定するので、拡大するほど相対的に空きが出て、隠れていた名前が現れる。
 * 置けなかったラベルは描かない（重ねて潰し合うより、拡大で読ませる）。
 */
export function placeLabels(input: PlaceLabelsInput): LabelPlacement[] {
  const { scale: z, offsetX: ox, offsetY: oy } = input;
  const lodFull = z > 1.2;
  const placed: Rect[] = [...input.reserved];
  const out: LabelPlacement[] = [];

  const list = input.nodes
    .slice(0, input.revealed)
    .filter((n) => !(input.isExcluded?.(n) ?? false))
    .sort((a, b) =>
      Number(input.selected === b.mbid) - Number(input.selected === a.mbid) || a.rank - b.rank);

  for (const n of list) {
    // 倍率 1.2 未満では、関連マップのランダム枠のラベルは畳む（島マップは畳まない）
    if (n.tier === 'random' && !lodFull && !input.isGenreView) continue;
    const sx = ox + n.x * z;
    const sy = oy + n.y * z;
    const r = n.r * z;
    if (sx < -60 || sx > input.width + 60 || sy < -40 || sy > input.height + 40) continue;
    const w = n.labelWidth + 6;
    const h = 14;
    const candidates: [number, number][] = [
      [0, r + 13], [0, -r - 6], [r + 8 + w / 2, 5], [-(r + 8 + w / 2), 5],
      [0, r + 25], [0, -r - 18], [r + 8 + w / 2, -9], [-(r + 8 + w / 2), -9],
    ];
    for (const [dx, dy] of candidates) {
      const rect: Rect = { x: sx + dx - w / 2, y: sy + dy - 11, w, h };
      if (placed.some((q) => overlaps(rect, q))) continue;
      placed.push(rect);
      out.push({ mbid: n.mbid, x: sx + dx, y: sy + dy, text: n.label });
      break;
    }
  }
  return out;
}
