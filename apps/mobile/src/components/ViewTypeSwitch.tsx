import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ViewType } from '@diggr/core';
import { color } from '../theme/tokens';

export interface ViewTypeSwitchProps {
  readonly value: ViewType;
  readonly onChange: (v: ViewType) => void;
  /** ジャンルそのものが中心のときは切り替えない（軸がひとつしかない） */
  readonly hidden?: boolean;
  /** シードにグラフが無く「関連アーティスト」に切り替えられない（FR-01 の二層化） */
  readonly relatedLocked?: boolean;
  readonly lockedCaption?: string;
}

/** 表示タイプ切替（FR-29）。切り替えは新しいマップとして生成される。 */
export function ViewTypeSwitch(
  { value, onChange, hidden, relatedLocked, lockedCaption }: ViewTypeSwitchProps,
): React.ReactElement | null {
  if (hidden) return null;
  return (
    <View>
      <View style={styles.wrap} accessibilityRole="tablist">
        {(['related', 'genre'] as const).map((v) => {
          const on = v === value;
          const locked = v === 'related' && relatedLocked;
          return (
            <Pressable
              key={v}
              accessibilityRole="tab"
              accessibilityState={{ selected: on, disabled: locked }}
              disabled={locked}
              onPress={() => { if (!on && !locked) onChange(v); }}
              style={[styles.item, on && styles.itemOn, locked && styles.itemLocked]}
            >
              <Text style={[styles.label, on && styles.labelOn, locked && styles.labelLocked]}>
                {v === 'related' ? '関連アーティスト' : '同じジャンル'}{locked ? ' 🔒' : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {relatedLocked && lockedCaption ? (
        <Text style={styles.caption}>{lockedCaption}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row', gap: 3, padding: 3, borderRadius: 22,
    backgroundColor: color.bgChrome, borderWidth: 1, borderColor: color.hairline,
  },
  item: { flex: 1, height: 34, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  itemOn: { backgroundColor: color.accent },
  itemLocked: { opacity: 0.45 },
  label: { fontSize: 13, color: color.textSecondary },
  labelOn: { color: '#FFFFFF', fontWeight: '700' },
  labelLocked: { color: color.textSecondary },
  caption: {
    color: color.textSecondary, fontSize: 10.5, textAlign: 'center', marginTop: 4,
    paddingHorizontal: 8,
  },
});
