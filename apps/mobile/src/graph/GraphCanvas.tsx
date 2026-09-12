import React, { useMemo } from 'react';
import {
  Canvas, Circle, Group, Path, Skia, DashPathEffect, RadialGradient, vec,
  type SkPath,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import type { DiggrMap, LaidOutNode, Layout, RelationType } from '@diggr/core';
import { color, genreColor, relationStyle, type GenreColorKey } from '../theme/tokens';

export interface GraphCanvasProps {
  readonly map: DiggrMap;
  readonly layout: Layout;
  readonly revealed: number;
  readonly width: number;
  readonly height: number;
  /** 画面中心（シードの位置）からのずれ */
  readonly tx: SharedValue<number>;
  readonly ty: SharedValue<number>;
  readonly scale: SharedValue<number>;
  /** 段階表示で伸びるルート（0→1） */
  readonly grow: SharedValue<number>;
  /** 呼吸（0→1 を往復）。動きを減らす設定では 1 で固定する */
  readonly pulse: SharedValue<number>;
  readonly selected: string | null;
  readonly checked: ReadonlySet<string>;
  readonly listened: ReadonlySet<string>;
  readonly relationColors: boolean;
  /** 絞り込み・ハイライトの対象判定。null なら全ノードが対象（通常状態） */
  readonly isLit: ((n: LaidOutNode) => boolean) | null;
  readonly isExcluded: (n: LaidOutNode) => boolean;
  /** ジャンル ID → 表示カテゴリ（8 系統） */
  readonly categoryOf: (genreId: string) => GenreColorKey;
}

/** ノードの色はプライマリジャンルのカテゴリ（FR-03） */
function useNodeColors(nodes: readonly LaidOutNode[], categoryOf: (g: string) => GenreColorKey) {
  return useMemo(() => {
    const m = new Map<string, string>();
    for (const n of nodes) m.set(n.mbid, genreColor[categoryOf(n.genres[0] ?? 'pop')]);
    return m;
  }, [nodes, categoryOf]);
}

function buildEdgePaths(nodes: readonly LaidOutNode[], revealed: number): Record<RelationType | 'plain', SkPath> {
  const paths = {
    listen: Skia.Path.Make(), collab: Skia.Path.Make(), member: Skia.Path.Make(),
    influence: Skia.Path.Make(), label: Skia.Path.Make(), plain: Skia.Path.Make(),
  };
  for (let i = 0; i < Math.min(revealed, nodes.length); i++) {
    const n = nodes[i]!;
    const t = n.relationTypes;
    const key: RelationType | 'plain' =
      t.includes('member') ? 'member'
        : t.includes('collab') ? 'collab'
          : t.includes('influence') ? 'influence'
            : t.includes('label') ? 'label'
              : t.includes('listen') ? 'listen' : 'plain';
    const p = paths[key];
    p.moveTo(0, 0);
    p.lineTo(n.x, n.y);
  }
  return paths;
}

export function GraphCanvas(props: GraphCanvasProps): React.ReactElement {
  const {
    map, layout, revealed, width, height, tx, ty, scale, grow, pulse,
    selected, checked, listened, relationColors, isLit, isExcluded, categoryOf,
  } = props;

  const cx = width / 2;
  const cy = height / 2;
  const transform = useDerivedValue(() => [
    { translateX: cx + tx.value },
    { translateY: cy + ty.value },
    { scale: scale.value },
  ]);

  const colors = useNodeColors(layout.nodes, categoryOf);

  const visible = layout.nodes.slice(0, revealed);
  // チェック済みバッジの「レ点」。ノードごとに Path を作らず 1 本にまとめる
  const checkPath = useMemo(() => {
    const p = Skia.Path.Make();
    for (let i = 0; i < Math.min(revealed, layout.nodes.length); i++) {
      const n = layout.nodes[i]!;
      if (!checked.has(n.mbid)) continue;
      const bx = n.x + n.r * 0.86 + 2.4;
      const by = n.y - n.r * 0.86 - 2.4;
      p.moveTo(bx - 2.1, by + 0.1);
      p.lineTo(bx - 0.6, by + 1.9);
      p.lineTo(bx + 2.2, by - 2);
    }
    return p;
  }, [layout.nodes, revealed, checked]);
  const edges = useMemo(
    () => (map.viewType === 'genre' ? null : buildEdgePaths(layout.nodes, revealed)),
    [layout.nodes, revealed, map.viewType],
  );

  const ringOpacity = useDerivedValue(() => 0.1 + 0.2 * pulse.value);
  const markedOpacity = useDerivedValue(() => 0.3 + 0.35 * pulse.value);

  return (
    <Canvas style={{ width, height }}>
      <Group transform={transform}>
        {/* 未解放（ゴースト） */}
        {layout.ghosts.map((g, i) => (
          <Circle key={`gh${i}`} cx={g.x} cy={g.y} r={4.2} style="stroke" strokeWidth={1}
            color={color.locked} opacity={0.35} />
        ))}

        {/* サブジャンルの島（同じジャンルの地図） */}
        {layout.islands.map((island) => (
          island.firstIndex < revealed ? (
            <Circle key={island.id} cx={island.x} cy={island.y} r={island.r}>
              <RadialGradient
                c={vec(island.x, island.y)}
                r={island.r}
                colors={[`${genreColor[island.category]}22`, `${genreColor[island.category]}00`]}
              />
            </Circle>
          ) : null
        ))}
        {layout.islands.map((island) => (
          island.firstIndex < revealed ? (
            <Circle key={`o${island.id}`} cx={island.x} cy={island.y} r={island.r}
              style="stroke" strokeWidth={1} color={genreColor[island.category]} opacity={0.3}>
              <DashPathEffect intervals={[3, 5]} />
            </Circle>
          ) : null
        ))}

        {/* シードからのルート。end で伸びていく（新しく出たノードほど後ろの контур） */}
        {edges ? (Object.keys(edges) as (RelationType | 'plain')[]).map((key) => {
          const p = edges[key];
          if (p.isEmpty()) return null;
          const style = key === 'plain' ? null : relationStyle[key];
          const stroke = relationColors && style ? style.edge : color.tierBoundary;
          return (
            <Path key={key} path={p} style="stroke" strokeWidth={key === 'plain' ? 0.6 : 1.4}
              color={stroke} opacity={key === 'plain' ? 0.14 : 0.5} start={0} end={grow}>
              {relationColors && style?.dash ? <DashPathEffect intervals={[...style.dash]} /> : null}
            </Path>
          );
        }) : null}

        {/* ノード */}
        {visible.map((n) => {
          const c = colors.get(n.mbid) ?? genreColor.pop;
          const excluded = isExcluded(n);
          const lit = isLit ? isLit(n) : true;
          const rnd = n.tier === 'random';
          const alpha = excluded ? 0.1 : rnd ? 0.72 : 1;
          return (
            <Group key={n.mbid} opacity={alpha}>
              {lit && isLit ? (
                <Circle cx={n.x} cy={n.y} r={n.r + 8} opacity={markedOpacity}>
                  <RadialGradient c={vec(n.x, n.y)} r={n.r + 8}
                    colors={[`${color.accentGlow}88`, `${color.accentGlow}00`]} />
                </Circle>
              ) : null}
              {lit && !isLit ? (
                <Circle cx={n.x} cy={n.y} r={n.r + 3.2} style="stroke" strokeWidth={1.1}
                  color={c} opacity={ringOpacity} />
              ) : null}
              <Circle cx={n.x} cy={n.y} r={n.r * (selected === n.mbid ? 1.25 : 1)} color={c} />
              {rnd ? (
                <Circle cx={n.x} cy={n.y} r={n.r} color={color.bgBase} opacity={0.34} />
              ) : null}
              {listened.has(n.mbid) ? (
                <Circle cx={n.x} cy={n.y} r={n.r} style="stroke" strokeWidth={2}
                  color={color.textPrimary} />
              ) : null}
              {checked.has(n.mbid) ? (
                <Group>
                  <Circle cx={n.x + n.r * 0.86 + 2.4} cy={n.y - n.r * 0.86 - 2.4} r={5}
                    color={listened.has(n.mbid) ? color.success : color.stateChecked} />
                  <Circle cx={n.x + n.r * 0.86 + 2.4} cy={n.y - n.r * 0.86 - 2.4} r={5}
                    style="stroke" strokeWidth={1.2} color={color.bgBase} />
                </Group>
              ) : null}
              {selected === n.mbid ? (
                <Circle cx={n.x} cy={n.y} r={n.r * 1.25 + 5} style="stroke" strokeWidth={1.6}
                  color={color.accentGlow} />
              ) : null}
            </Group>
          );
        })}

        {/* チェック済みのレ点（白丸の内側） */}
        <Path path={checkPath} style="stroke" strokeWidth={1.5}
          strokeCap="round" strokeJoin="round" color={color.bgBase} />

        {/* シード（中心） */}
        <Circle cx={0} cy={0} r={72}>
          <RadialGradient c={vec(0, 0)} r={72}
            colors={[`${color.accent}6B`, `${color.accent}1F`, `${color.accent}00`]} />
        </Circle>
        <Circle cx={0} cy={0} r={36} style="stroke" strokeWidth={1} color={color.accentGlow} opacity={0.3} />
        <Circle cx={0} cy={0} r={27} style="stroke" strokeWidth={1} color={color.accentGlow} opacity={0.45}>
          <DashPathEffect intervals={[2, 5]} />
        </Circle>
        <Circle cx={0} cy={0} r={21} color={color.accent} />
        <SeedIcon isGenre={map.seedType === 'genre'} />
      </Group>
    </Canvas>
  );
}

/** 中心がアーティストなら人、ジャンルそのものなら音符（画面設計書 §5.2） */
function SeedIcon({ isGenre }: { isGenre: boolean }): React.ReactElement {
  const stroke = useMemo(() => {
    const p = Skia.Path.Make();
    if (isGenre) {
      p.moveTo(1.2, 5.2);
      p.lineTo(1.2, -6.4);
      p.lineTo(7.6, -8.6);
    } else {
      p.moveTo(-7.2, 8.4);
      p.quadTo(0, 1.4, 7.2, 8.4);
    }
    return p;
  }, [isGenre]);
  return (
    <>
      {isGenre
        ? <Circle cx={-2.6} cy={5.2} r={3.6} color={color.textPrimary} />
        : <Circle cx={0} cy={-4.2} r={3.7} color={color.textPrimary} />}
      <Path path={stroke} color={color.textPrimary} style="stroke"
        strokeWidth={isGenre ? 1.8 : 3.2} strokeCap="round" strokeJoin="round" />
    </>
  );
}
