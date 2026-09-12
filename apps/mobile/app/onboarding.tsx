import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Button } from '../src/components/Button';
import { SERVICES, SERVICE_KEYS, type ServiceKey } from '../src/services/links';
import { useAppStore } from '../src/state/store';
import { color } from '../src/theme/tokens';

interface Page { readonly title: string; readonly body: string }

const PAGES: readonly Page[] = [
  {
    title: '音楽の地図を、\n手で掘る。',
    body: '好きなアーティストを 1 つ検索すると、関連アーティストが放射状に広がります。'
      + 'ノードの大きさは類似度、線の種類は関係性。聴く前に当てを付けられます。',
  },
  {
    title: 'タップして読み、\n気になったら聴く。',
    body: 'ノードをタップすると関係の説明が開きます。気に入ったら、普段使っている音楽アプリの'
      + 'そのアーティストのページにそのまま移動します。DIGGR 自体は音を鳴らしません。',
  },
  {
    title: '普段どこで聴きますか？',
    body: '選んだアプリへ 1 タップで移動できるようにします。あとから設定でいつでも変更できます。',
  },
];

/** SC-02 オンボーディング。3 画面の最後に普段使いの音楽アプリを選ばせる。 */
export default function OnboardingScreen(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);
  const [service, setService] = useState<ServiceKey | null>(null);
  const setPref = useAppStore((s) => s.setPref);

  const finish = (): void => {
    if (service) setPref('service', service);
    setPref('onboarded', true);
    router.replace('/');
  };

  const next = (): void => {
    if (page < PAGES.length - 1) setPage(page + 1);
    else finish();
  };

  const current = PAGES[page]!;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.art}>
        <View style={styles.artCenter} />
        {[0, 1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={[
              styles.artDot,
              {
                transform: [
                  { rotate: `${i * 72}deg` },
                  { translateY: -54 },
                ],
              },
            ]}
          />
        ))}
      </View>

      <Text style={styles.title}>{current.title}</Text>
      <Text style={styles.body}>{current.body}</Text>

      {page === PAGES.length - 1 ? (
        <View style={styles.grid}>
          {SERVICE_KEYS.map((k) => (
            <Pressable
              key={k}
              onPress={() => setService(k)}
              style={[styles.svc, service === k && styles.svcOn]}
              accessibilityRole="radio"
              accessibilityState={{ selected: service === k }}
            >
              <Text style={styles.svcName}>{SERVICES[k].name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={{ flex: 1 }} />

      <View style={styles.dots}>
        {PAGES.map((_, i) => (
          <View key={i} style={[styles.dot, i === page && styles.dotOn]} />
        ))}
      </View>

      <Button
        label={page === PAGES.length - 1 ? '始める' : '次へ'}
        onPress={next}
      />
      {page < PAGES.length - 1 ? (
        <Pressable onPress={finish} style={styles.skip} accessibilityRole="button">
          <Text style={styles.skipText}>スキップ</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgBase, paddingHorizontal: 26, gap: 18 },
  art: {
    height: 200, alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  artCenter: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: color.accent,
    shadowColor: color.accentGlow, shadowOpacity: 0.6, shadowRadius: 20, elevation: 8,
  },
  artDot: {
    position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: color.accentGlow,
  },
  title: {
    color: color.textPrimary, fontSize: 26, fontWeight: '700', lineHeight: 34,
  },
  body: { color: color.textSecondary, fontSize: 14.5, lineHeight: 22 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  svc: {
    flexBasis: '47%', flexGrow: 1, borderRadius: 14, borderWidth: 1, borderColor: color.hairline,
    backgroundColor: color.bgSurface, paddingVertical: 14, paddingHorizontal: 12,
  },
  svcOn: { borderColor: color.accent, backgroundColor: '#1A1730' },
  svcName: { color: color.textPrimary, fontSize: 14.5, fontWeight: '700' },
  dots: { flexDirection: 'row', gap: 7, justifyContent: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#2E2E3D' },
  dotOn: { backgroundColor: color.accentGlow, width: 20 },
  skip: { alignItems: 'center', paddingVertical: 10 },
  skipText: { color: color.textSecondary, fontSize: 13 },
});
