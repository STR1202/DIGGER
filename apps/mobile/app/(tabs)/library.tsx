import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { api } from '../../src/api';
import { listHistory, type HistoryOrder } from '../../src/db';
import { useAppStore, type Bookmark, type MapRecord } from '../../src/state/store';
import { color } from '../../src/theme/tokens';

const ORDER_LABEL: Record<HistoryOrder, string> = {
  created_at: '日付順', last_opened_at: '最近開いた順', node_count: 'ノード数順',
};

/** SC-11 マイディグ。履歴はマップ単位で、引き直しは系譜として並ぶ。
 * v3.1 で検索・並べ替え・組み込みを追加（いずれも端末 DB への SQL 一発）。 */
export default function LibraryScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'maps' | 'saved'>('maps');
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<HistoryOrder>('created_at');
  const cachedHistory = useAppStore((s) => s.history);
  const bookmarks = useAppStore((s) => s.bookmarks);
  const openMap = useAppStore((s) => s.openMap);
  const entitlement = useAppStore((s) => s.entitlement);
  const limit = entitlement.plan === 'free' ? 10 : Number.POSITIVE_INFINITY;

  const searched = useQuery({
    queryKey: ['history', order, query],
    queryFn: () => listHistory({ limit: 60, order, query }),
    enabled: tab === 'maps' && (query.trim().length > 0 || order !== 'created_at'),
  });
  const history = searched.data ?? cachedHistory;

  const open = (h: Pick<MapRecord, 'id' | 'revealed' | 'seedType' | 'seedKey' | 'viewType' | 'genreId' | 'randomOn'>): void => {
    void api.getMap(h.id)
      .catch(() => api.createMap({
        seedType: h.seedType, seedKey: h.seedKey, viewType: h.viewType,
        genreId: h.genreId, randomOn: h.randomOn,
      }))
      .then((m) => { openMap(m, h.revealed); router.push('/map'); });
  };

  const openBookmark = (b: Bookmark): void => {
    if (b.targetType === 'map') {
      void api.getMap(b.targetKey).then((m) => { openMap(m); router.push('/map'); }).catch(() => undefined);
      return;
    }
    void api.createMap({
      seedType: b.targetType, seedKey: b.targetKey,
      viewType: b.targetType === 'genre' ? 'genre' : 'related',
      randomOn: false,
    }).then((m) => { openMap(m); router.push('/map'); });
  };

  const bookmarkSubtitle = (b: Bookmark): string => (
    b.targetType === 'artist' ? 'アーティスト' : b.targetType === 'genre' ? 'ジャンル' : '保存したマップ'
  );

  const orders = useMemo(() => Object.keys(ORDER_LABEL) as HistoryOrder[], []);

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
        <>
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="シード名・含まれるアーティスト名で検索"
            placeholderTextColor={color.textSecondary}
          />
          <View style={styles.chips}>
            {orders.map((o) => (
              <Pressable key={o} onPress={() => setOrder(o)} style={[styles.chip, order === o && styles.chipOn]}>
                <Text style={[styles.chipText, order === o && styles.chipTextOn]}>{ORDER_LABEL[o]}</Text>
              </Pressable>
            ))}
          </View>
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
                      : `確定 ${item.coreCount} ＋ ${item.nodeUids.length - item.coreCount}`}
                    {' · '}{item.nodeUids.length} 件 · {new Date(item.createdAt).toLocaleString('ja-JP')}
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
        </>
      ) : (
        <FlatList
          data={bookmarks}
          keyExtractor={(b) => b.id}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => openBookmark(item)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{item.targetName}</Text>
                <Text style={styles.caption}>{bookmarkSubtitle(item)}</Text>
              </View>
              <Text style={styles.caption}>開く</Text>
            </Pressable>
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
  search: {
    height: 40, borderRadius: 12, backgroundColor: color.bgElevated,
    borderWidth: 1, borderColor: color.hairline, paddingHorizontal: 12,
    color: color.textPrimary, fontSize: 13.5,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: color.hairline, backgroundColor: color.bgSurface,
  },
  chipOn: { borderColor: color.accent, backgroundColor: '#1A1730' },
  chipText: { color: color.textSecondary, fontSize: 11.5 },
  chipTextOn: { color: color.textPrimary, fontWeight: '700' },
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
