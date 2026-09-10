import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ViewType } from '@diggr/core';
import { color } from '../theme/tokens';

export interface ViewTypeSwitchProps {
  readonly value: ViewType;
  readonly onChange: (v: ViewType) => void;
  /** ジャンルそのものが中心のときは切り替えない（軸がひとつしかない） */
  readonly hidden?: boolean;
}

/** 表示タイプ切替（FR-29）。切り替えは新しいマップとして生成される。 */
export function ViewTypeSwitch({ value, onChange, hidden }: ViewTypeSwitchProps): React.ReactElement | null {
  if (hidden) return null;
  return (
    <View style={styles.wrap} accessibilityRole="tablist">
      {(['related', 'genre'] as const).map((v) => {
        const on = v === value;
        return (
          <Pressable
            key={v}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => { if (!on) onChange(v); }}
            style={[styles.item, on && styles.itemOn]}
          >
            <Text style={[styles.label, on && styles.labelOn]}>
              {v === 'related' ? '関連アーティスト' : '同じジャンル'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row', gap: 3, padding: 3, borderRadius: 22,
    backgroundColor: 'rgba(18,18,26,0.94)', borderWidth: 1, borderColor: color.hairline,
  },
  item: { flex: 1, height: 34, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  itemOn: { backgroundColor: color.accent },
  label: { fontSize: 13, color: color.textSecondary },
  labelOn: { color: '#FFFFFF', fontWeight: '700' },
});
