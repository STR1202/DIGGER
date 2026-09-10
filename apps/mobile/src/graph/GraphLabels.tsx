import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import type { Island, LabelPlacement } from '@diggr/core';
import { color, genreColor } from '../theme/tokens';

export interface GraphLabelsProps {
  readonly labels: readonly LabelPlacement[];
  readonly islands: readonly Island[];
  readonly revealed: number;
  readonly seedName: string;
  readonly seedType: 'artist' | 'genre';
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly interacting: SharedValue<number>;
  readonly checked: ReadonlySet<string>;
  /** 現在の変形（共有値）。ラベルは配置済みの座標に差分変形をかけて追従する */
  readonly liveScale: SharedValue<number>;
  readonly liveTx: SharedValue<number>;
  readonly liveTy: SharedValue<number>;
  readonly centerX: number;
  readonly centerY: number;
}

/**
 * ラベルは Skia ではなく RN の Text で描く。
 * フォントアセットを同梱せずに済み、Dynamic Type とスクリーンリーダーにそのまま乗る。
 * 操作中は畳む（毎フレーム置き直すとフレームを落とすため）。
 */
export function GraphLabels(props: GraphLabelsProps): React.ReactElement {
  const {
    labels, islands, revealed, seedName, seedType, scale, offsetX, offsetY, checked,
    liveScale, liveTx, liveTy, centerX, centerY,
  } = props;

  // 置いたときの変形（scale, tx, ty）と、いまの変形の差分だけを重ねる。
  // ピンチ・パンの最中もラベルはノードに貼り付いたまま動き、
  // 指を離した時点で親が置き直す（そのとき差分は 1 に戻る）。
  const tx0 = offsetX - centerX;
  const ty0 = offsetY - centerY;
  const follow = useAnimatedStyle(() => {
    const k = liveScale.value / scale;
    return {
      transform: [
        { translateX: liveTx.value - k * tx0 },
        { translateY: liveTy.value - k * ty0 },
        { scale: k },
      ],
    };
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, follow]} pointerEvents="none">
      {/* サブジャンルの島の名前（同じジャンルの地図） */}
      {islands.map((island) => (
        island.firstIndex < revealed ? (
          <Text
            key={island.id}
            style={[
              styles.island,
              {
                color: genreColor[island.category],
                left: offsetX + island.x * scale - 90,
                top: offsetY + (island.y - island.r) * scale - 20,
              },
            ]}
            numberOfLines={1}
          >
            {island.name} · {island.count}
          </Text>
        ) : null
      ))}

      {/* シード名は常にチップで出す（縮小しても中心が読める） */}
      <View style={[styles.seedChip, { left: offsetX - 90, top: offsetY - 21 * scale - 44 }]}>
        <Text style={styles.seedLabel} numberOfLines={1}>{seedName}</Text>
      </View>
      <Text style={[styles.seedKind, { left: offsetX - 90, top: offsetY - 21 * scale - 62 }]}>
        {seedType === 'genre' ? 'GENRE SEED' : 'SEED'}
      </Text>

      {labels.map((l) => (
        <Text
          key={l.mbid}
          style={[styles.node, { left: l.x - 90, top: l.y - 8 }]}
          numberOfLines={1}
        >
          {l.text}{checked.has(l.mbid) ? ' ✓' : ''}
        </Text>
      ))}
    </Animated.View>
  );
}

const shadowText = {
  textShadowColor: 'rgba(10,10,15,0.95)',
  textShadowRadius: 4,
  textShadowOffset: { width: 0, height: 0 },
} as const;

const styles = StyleSheet.create({
  node: {
    position: 'absolute', width: 180, textAlign: 'center',
    color: color.textPrimary, fontSize: 11, fontWeight: '500', ...shadowText,
  },
  island: {
    position: 'absolute', width: 180, textAlign: 'center',
    fontSize: 11.5, fontWeight: '700', ...shadowText,
  },
  seedChip: {
    position: 'absolute', width: 180, alignItems: 'center',
  },
  seedLabel: {
    color: '#FFFFFF', fontSize: 13.5, fontWeight: '700',
    backgroundColor: color.accent, borderRadius: 14, overflow: 'hidden',
    paddingHorizontal: 12, paddingVertical: 5,
  },
  seedKind: {
    position: 'absolute', width: 180, textAlign: 'center',
    color: color.textSecondary, fontSize: 10, letterSpacing: 1, ...shadowText,
  },
});
