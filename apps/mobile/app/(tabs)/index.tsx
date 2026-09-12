import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { api, type SearchHit } from '../../src/api';
import { AdBanner } from '../../src/components/AdBanner';
import { useAppStore, type MapRecord } from '../../src/state/store';
import { color } from '../../src/theme/tokens';

const TODAY = ['Radiohead', 'Fishmans', 'Aphex Twin', 'Alice Coltrane', 'My Bloody Valentine'];

/** SC-03 ホーム（検索）。入力欄とランダム表示の切り替え以外は探索の呼び水に徹する。 */
export default function SearchScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const prefs = useAppStore((s) => s.prefs);
  const setPref = useAppStore((s) => s.setPref);
  const history = useAppStore((s) => s.history);
  const openMap = useAppStore((s) => s.openMap);
  const [busy, setBusy] = useState(false);

  const results = useQuery({
    queryKey: ['search', query],
    queryFn: () => api.search(query),
    enabled: query.trim().length > 0,
  });

  const dig = useCallback(async (hit: { type: 'artist' | 'genre'; key: string }) => {
    setBusy(true);
    try {
      const map = await api.createMap({
        seedType: hit.type,
        seedKey: hit.key,
        viewType: hit.type === 'genre' ? 'genre' : 'related',
        randomOn: prefs.randomOn,
      });
      openMap(map);
      router.push('/map');
    } finally {
      setBusy(false);
    }
  }, [prefs.randomOn, openMap]);

  /**
   * 履歴を開く。サーバー（またはローカル実装）にマップが残っていればそれを、
   * 失われていれば同じ条件で組み直す。乱数シードとノード集合は履歴側に持っている。
   */
  const reopen = useCallback(async (h: MapRecord) => {
    setBusy(true);
    try {
      const map = await api.getMap(h.id).catch(() => api.createMap({
        seedType: h.seedType, seedKey: h.seedKey, viewType: h.viewType,
        genreId: h.genreId, randomOn: h.randomOn,
      }));
      openMap(map, h.revealed);
      router.push('/map');
    } finally {
      setBusy(false);
    }
  }, [openMap]);

  const seeds = useQuery({
    queryKey: ['today'],
    queryFn: async () => {
      const hits = await Promise.all(TODAY.map((n) => api.search(n)));
      return hits.map((h) => h.find((x) => x.type === 'artist')).filter(Boolean) as SearchHit[];
    },
  });

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <Text style={styles.brand}>DIGGR</Text>

      <TextInput
        style={styles.input}
        value={query}
        onChangeText={setQuery}
        placeholder="アーティストを検索"
        placeholderTextColor={color.textSecondary}
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="アーティストを検索"
      />

      <View style={styles.randomRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>ランダム表示を混ぜる</Text>
          <Text style={styles.caption}>
            OFF は類似度の高い順。ON にすると外側が毎回入れ替わり、引き直しが使えます
          </Text>
        </View>
        <Switch
          value={prefs.randomOn}
          onValueChange={(v) => setPref('randomOn', v)}
          trackColor={{ true: '#38295E', false: '#2C2C3A' }}
          thumbColor={prefs.randomOn ? color.accentGlow : '#8E8E9A'}
        />
      </View>

      {busy ? <ActivityIndicator color={color.accentGlow} /> : null}

      {query.trim() ? (
        <FlatList
          data={results.data ?? []}
          keyExtractor={(item) => `${item.type}:${item.key}`}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => void dig(item)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{item.name}</Text>
                <Text style={styles.caption}>{item.subtitle}</Text>
              </View>
              <Text style={styles.caption}>{item.type === 'genre' ? 'ジャンル' : ''}</Text>
            </Pressable>
          )}
          ListEmptyComponent={
            results.isFetching ? null : (
              <Text style={styles.caption}>
                「{query}」に一致するアーティストがありません。読み・略称・英字表記でも探せます。
              </Text>
            )
          }
        />
      ) : (
        <FlatList
          data={seeds.data ?? []}
          keyExtractor={(item) => item.key}
          ListHeaderComponent={
            history.length ? (
              <>
                <Text style={styles.section}>最近のディグ</Text>
                {history.slice(0, 5).map((h) => (
                  <Pressable key={h.id} style={styles.row} onPress={() => void reopen(h)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowLabel}>{h.seedName}</Text>
                      <Text style={styles.caption}>
                        {h.viewType === 'genre' ? '同じジャンル' : `確定 ${h.coreCount}`} · {h.nodeUids.length} 件
                      </Text>
                    </View>
                  </Pressable>
                ))}
                <Text style={styles.section}>今日のシード</Text>
              </>
            ) : <Text style={styles.section}>今日のシード</Text>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => void dig(item)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{item.name}</Text>
                <Text style={styles.caption}>{item.subtitle}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
      <AdBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgBase, paddingHorizontal: 16, gap: 12 },
  brand: { color: color.textPrimary, fontSize: 20, fontWeight: '900', letterSpacing: 4 },
  input: {
    height: 50, borderRadius: 14, backgroundColor: color.bgElevated,
    borderWidth: 1, borderColor: color.hairline, paddingHorizontal: 14,
    color: color.textPrimary, fontSize: 15,
  },
  randomRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
    borderRadius: 14, borderWidth: 1, borderColor: color.hairline,
    backgroundColor: color.bgSurface,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#17171F',
  },
  rowLabel: { color: color.textPrimary, fontSize: 15, fontWeight: '500' },
  caption: { color: color.textSecondary, fontSize: 11.5, lineHeight: 16 },
  section: { color: color.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, marginTop: 12 },
});
