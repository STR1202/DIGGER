import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { api } from '../../src/api';
import { useAppStore } from '../../src/state/store';
import { color } from '../../src/theme/tokens';

/** SC-11 マイディグ。履歴はマップ単位で、引き直しは系譜として並ぶ。 */
export default function LibraryScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'maps' | 'saved'>('maps');
  const history = useAppStore((s) => s.history);
  const bookmarks = useAppStore((s) => s.bookmarks);
  const openMap = useAppStore((s) => s.openMap);
  const entitlement = useAppStore((s) => s.entitlement);
  const limit = entitlement.plan === 'free' ? 10 : Number.POSITIVE_INFINITY;

  const open = (h: { id: string; revealed: number; seedType: 'artist' | 'genre'; seedKey: string;
    viewType: 'related' | 'genre'; genreId: string | null; randomOn: boolean }): void => {
    void api.getMap(h.id)
      .catch(() => api.createMap({
        seedType: h.seedType, seedKey: h.seedKey, viewType: h.viewType,
        genreId: h.genreId, randomOn: h.randomOn,
      }))
      .then((m) => { openMap(m, h.revealed); router.push('/map'); });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <Text style={styles.title}>マイディグ</Text>
      <View style={styles.seg}>
        {(['maps', 'saved'] as const).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[styles.segItem, tab === t && styles.segOn]}>
            <Text style={[styles.segLabel, tab === t && styles.segLabelOn]}>
              {t === 'maps' ? '履歴' : '保存'}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'maps' ? (
        <FlatList
          data={history.slice(0, limit)}
          keyExtractor={(h) => h.id}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => open(item)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>
                  {item.parentMapId ? '↳ 引き直し ' : ''}{item.seedName}
                </Text>
                <Text style={styles.caption}>
                  {item.viewType === 'genre'
                    ? '同じジャンル'
                    : `確定 ${item.coreCount} ＋ ${item.nodeMbids.length - item.coreCount}`}
                  {' · '}{item.nodeMbids.length} 件 · {new Date(item.createdAt).toLocaleString('ja-JP')}
                </Text>
              </View>
              <Text style={styles.caption}>開く</Text>
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.caption}>まだマップの記録はありません。</Text>}
          ListFooterComponent={
            entitlement.plan === 'free' && history.length >= 10 ? (
              <Text style={styles.note}>
                無料プランで保存できる履歴は 10 件までです。90 日アクセスのないマップは自動で消えます
                （保存したものは残ります）。
              </Text>
            ) : null
          }
        />
      ) : (
        <FlatList
          data={bookmarks}
          keyExtractor={(b) => b}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{item}</Text>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.caption}>
              保存はまだありません。ノードを長押し、または詳細シートの★で保存できます。
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgBase, paddingHorizontal: 16, gap: 12 },
  title: { color: color.textPrimary, fontSize: 20, fontWeight: '700' },
  seg: {
    flexDirection: 'row', gap: 3, padding: 3, borderRadius: 12,
    backgroundColor: color.bgElevated, borderWidth: 1, borderColor: color.hairline,
  },
  segItem: { flex: 1, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: color.accent },
  segLabel: { color: color.textSecondary, fontSize: 13 },
  segLabelOn: { color: '#FFFFFF', fontWeight: '700' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#17171F',
  },
  rowLabel: { color: color.textPrimary, fontSize: 15, fontWeight: '500' },
  caption: { color: color.textSecondary, fontSize: 11.5 },
  note: {
    color: color.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 12,
    borderWidth: 1, borderStyle: 'dashed', borderColor: '#3B3556',
    borderRadius: 14, padding: 12,
  },
});
