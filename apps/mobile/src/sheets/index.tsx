import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import type { DiggrMap, MapNode, RelationType } from '@diggr/core';
import { color, genreColor, radius, relationStyle, shadow } from '../theme/tokens';
import { Button } from '../components/Button';
import { SERVICES, SERVICE_KEYS, type ServiceKey } from '../services/links';
import type { Filters } from '../state/store';
import { genreName, categoryOf, type Facet } from '../data/genres';

/** ボトムシート（画面設計書 §4.5）。3 段のスナップは高さの割合で扱う。 */
export function Sheet(props: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly heightRatio?: number;
  readonly children: React.ReactNode;
}): React.ReactElement | null {
  if (!props.open) return null;
  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={styles.scrim} onPress={props.onClose} accessibilityLabel="閉じる" />
      <Animated.View
        entering={SlideInDown.duration(280)}
        exiting={SlideOutDown.duration(220)}
        style={[styles.sheet, shadow.panel, { maxHeight: `${(props.heightRatio ?? 0.62) * 100}%` }]}
      >
        <View style={styles.grabber} />
        <ScrollView contentContainerStyle={styles.body}>{props.children}</ScrollView>
      </Animated.View>
    </View>
  );
}

/** SC-06 アーティスト詳細。名前 → 関係の説明 → 掘る → フル尺で聴く（FR-23）。 */
export function ArtistSheet(props: {
  readonly node: MapNode | null;
  readonly map: DiggrMap;
  readonly service: ServiceKey | null;
  readonly listened: boolean;
  readonly bookmarked: boolean;
  readonly onClose: () => void;
  readonly onDig: (mbid: string) => void;
  readonly onListen: (service: ServiceKey) => void;
  readonly onBookmark: () => void;
}): React.ReactElement {
  const { node, map } = props;
  const core = node?.tier === 'core';
  const primary = props.service ?? 'spotify';
  const others = SERVICE_KEYS.filter((k) => k !== primary);

  return (
    <Sheet open={node !== null} onClose={props.onClose} heightRatio={0.66}>
      {node ? (
        <>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{node.name}</Text>
              <Text style={styles.meta}>
                {node.beginYear ?? ''}年〜 · {node.country ?? ''}
                {core && node.score !== undefined ? ` · 類似度 ${Math.round(node.score * 100)}%` : ''}
              </Text>
              <Text style={[styles.tag, core ? styles.tagCore : styles.tagRandom]}>
                {core ? '確定枠' : map.randomOn ? 'ランダム枠' : '類似度順'}
              </Text>
            </View>
            <Pressable onPress={props.onBookmark} accessibilityLabel="ブックマーク" hitSlop={10}>
              <Text style={styles.star}>{props.bookmarked ? '★' : '☆'}</Text>
            </Pressable>
          </View>

          <Text style={styles.checkedLine}>
            {props.listened
              ? '✓ チェック済み — 外部アプリで聴きに行きました'
              : '✓ チェック済み — 地図では白いチェックが付きます'}
          </Text>

          <Text style={styles.section}>{map.seedName} との関係</Text>
          {(core ? node.relationTypes : []).map((t: RelationType) => (
            <View key={t} style={styles.relRow}>
              <View style={[styles.relSwatch, { borderTopColor: relationStyle[t].edge }]} />
              <Text style={styles.relText}>{relationStyle[t].label}</Text>
            </View>
          ))}
          {!core ? (
            <Text style={styles.relText}>
              {map.viewType === 'genre'
                ? node.fresh
                  ? '同じジャンル — 関連アーティストの地図には出てこなかった顔ぶれです'
                  : '同じジャンル — 関連アーティストの地図にも出ています'
                : map.randomOn
                  ? 'ランダム枠 — 強い関連ではなく「周辺」から引かれました'
                  : '類似度順 — 確定枠のすぐ外側です'}
            </Text>
          ) : null}

          <View style={styles.chips}>
            {node.genres.map((g) => (
              <View key={g} style={[styles.chip, { borderColor: genreColor[categoryOf(g)] }]}>
                <Text style={[styles.chipText, { color: genreColor[categoryOf(g)] }]}>{genreName(g)}</Text>
              </View>
            ))}
          </View>

          <Button label="ここから掘る" onPress={() => props.onDig(node.mbid)} />

          <Text style={styles.section}>フル尺で聴く（FR-23）</Text>
          <Button label={`▶ ${SERVICES[primary].name} で聴く`} variant="secondary"
            onPress={() => props.onListen(primary)} />
          <View style={styles.serviceRow}>
            {others.map((k) => (
              <Button key={k} label={SERVICES[k].short} variant="ghost" size="small"
                style={{ flex: 1 }} onPress={() => props.onListen(k)} />
            ))}
          </View>
        </>
      ) : null}
    </Sheet>
  );
}


/** SC-07 ジャンルパネル。表示中の地図をジャンルという別の軸で読み直す。 */
export function GenrePanel(props: {
  readonly open: boolean;
  readonly facets: readonly Facet[];
  readonly highlight: readonly string[];
  readonly onToggle: (genreId: string) => void;
  readonly onClear: () => void;
  readonly onDig: (genreId: string) => void;
  readonly onClose: () => void;
}): React.ReactElement {
  const [expanded, setExpanded] = React.useState<string[]>([]);
  const byParent = React.useMemo(() => {
    const m = new Map<string | null, Facet[]>();
    for (const f of props.facets) {
      const list = m.get(f.parent) ?? [];
      list.push(f);
      m.set(f.parent, list);
    }
    for (const list of m.values()) list.sort((a, b) => b.count - a.count);
    return m;
  }, [props.facets]);

  const rows: React.ReactElement[] = [];
  const walk = (parent: string | null, depth: number): void => {
    for (const f of byParent.get(parent) ?? []) {
      const open = expanded.includes(f.id);
      const on = props.highlight.includes(f.id);
      rows.push(
        <Pressable
          key={f.id}
          onPress={() => props.onToggle(f.id)}
          style={[styles.genreRow, { paddingLeft: (depth - 1) * 18 }]}
          accessibilityRole="button"
          accessibilityState={{ selected: on }}
        >
          <Pressable
            onPress={() => setExpanded((e) => (open ? e.filter((x) => x !== f.id) : [...e, f.id]))}
            hitSlop={8}
            style={styles.caret}
          >
            <Text style={styles.caretText}>{f.hasChildren ? (open ? '▾' : '▸') : ''}</Text>
          </Pressable>
          <View style={[styles.gdot, { backgroundColor: genreColor[categoryOf(f.id)] }]} />
          <Text style={[styles.genreName, on && styles.genreNameOn]} numberOfLines={1}>{f.name}</Text>
          <Text style={styles.genreCount}>{f.count}</Text>
        </Pressable>,
      );
      if (open) walk(f.id, depth + 1);
    }
  };
  walk(null, 1);

  const first = props.highlight[0];
  return (
    <Sheet open={props.open} onClose={props.onClose} heightRatio={0.72}>
      <View style={styles.row}>
        <Text style={[styles.title, { flex: 1 }]}>ジャンル（{props.facets.length}）</Text>
        {props.highlight.length ? (
          <Pressable onPress={props.onClear}><Text style={styles.link}>ハイライト解除</Text></Pressable>
        ) : null}
      </View>
      <View>{rows}</View>
      <Text style={styles.meta}>
        親ジャンルを選ぶと子ジャンルも含めてハイライトします。階層は最大 3 段。
      </Text>
      <Button
        label="このジャンルを掘る"
        disabled={!first}
        onPress={() => { if (first) props.onDig(first); }}
      />
    </Sheet>
  );
}

/** SC-09 ペイウォール。プランは 2 枚だけ（v2.1 で買い切りを廃止）。 */
export function Paywall(props: {
  readonly open: boolean;
  readonly hidden: number;
  readonly seedName: string;
  readonly onClose: () => void;
  readonly onPurchase: (plan: 'pro_monthly' | 'pro_yearly') => void;
  readonly onWatchAd?: (() => void) | undefined;
}): React.ReactElement {
  const [plan, setPlan] = React.useState<'pro_monthly' | 'pro_yearly'>('pro_yearly');
  return (
    <Sheet open={props.open} onClose={props.onClose} heightRatio={0.88}>
      <Text style={styles.display}>まだ {props.hidden} 組が{'\n'}隠れています</Text>
      <Text style={styles.meta}>{props.seedName} の地図を全部見る</Text>
      {[
        '30 → 100 ノードへ',
        'ランダム表示を混ぜて引き直せる回数も無制限',
        'ジャンル階層と年代・関係タイプのフィルタ',
        '広告なし・履歴とブックマークが無制限',
      ].map((v) => (
        <Text key={v} style={styles.value}>✓ {v}</Text>
      ))}
      {(['pro_yearly', 'pro_monthly'] as const).map((p) => (
        <Pressable key={p} onPress={() => setPlan(p)}
          style={[styles.plan, plan === p && styles.planOn]}>
          <Text style={styles.planName}>
            {p === 'pro_yearly' ? 'DIGGR Pro 年額' : 'DIGGR Pro 月額'}
          </Text>
          <Text style={styles.planPrice}>{p === 'pro_yearly' ? '¥3,800 / 年' : '¥480 / 月'}</Text>
          <Text style={styles.meta}>
            {p === 'pro_yearly'
              ? '7日間無料でお試し・自動更新・いつでも解約できます'
              : '自動更新。ストアからいつでも解約できます'}
          </Text>
        </Pressable>
      ))}
      <Button
        label={plan === 'pro_yearly' ? '無料で始める' : '購入する'}
        onPress={() => props.onPurchase(plan)}
      />
      {props.onWatchAd ? (
        <Button label="🎬 広告を見て30分だけ解放" variant="ghost" size="medium"
          onPress={props.onWatchAd} />
      ) : null}
    </Sheet>
  );
}

/** SC-16 フィルタ。層（確定/ランダム）の切り替えは廃止し、年代・関係タイプ・国だけ。 */
export function FilterSheet(props: {
  readonly open: boolean;
  readonly filters: Filters;
  readonly countries: readonly string[];
  readonly hits: number;
  readonly total: number;
  readonly isPro: boolean;
  readonly onChange: (f: Partial<Filters>) => void;
  readonly onApply: () => void;
  readonly onClear: () => void;
  readonly onClose: () => void;
}): React.ReactElement {
  const types = useMemo(
    () => Object.keys(relationStyle) as RelationType[],
    [],
  );
  return (
    <Sheet open={props.open} onClose={props.onClose} heightRatio={0.74}>
      <Text style={styles.title}>絞り込み</Text>
      <Text style={styles.meta}>活動開始年 {props.filters.from} — {props.filters.to}</Text>
      <View style={styles.chips}>
        {[1960, 1970, 1980, 1990, 2000, 2010, 2020].map((y) => (
          <Pressable key={y} onPress={() => props.onChange({ from: y, to: Math.min(2026, y + 19) })}
            style={styles.chip}>
            <Text style={styles.chipText}>{y}年代</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => props.onChange({ from: 1940, to: 2026 })} style={styles.chip}>
          <Text style={styles.chipText}>すべての年代</Text>
        </Pressable>
      </View>

      <Text style={styles.section}>関係タイプ（FR-21）</Text>
      <View style={styles.chips}>
        {types.map((t) => {
          const on = props.filters.types.includes(t);
          return (
            <Pressable
              key={t}
              onPress={() => props.onChange({
                types: on
                  ? props.filters.types.filter((x) => x !== t)
                  : [...props.filters.types, t],
              })}
              style={[styles.chip, on && { borderColor: relationStyle[t].chip }]}
            >
              <Text style={[styles.chipText, on && { color: relationStyle[t].chip }]}>
                {relationStyle[t].label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.section}>国</Text>
      <View style={styles.chips}>
        {['all', ...props.countries].map((c) => (
          <Pressable key={c} onPress={() => props.onChange({ country: c })}
            style={[styles.chip, props.filters.country === c && { borderColor: color.accentGlow }]}>
            <Text style={styles.chipText}>{c === 'all' ? 'すべて' : c}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.meta}>
        条件に合うのは {props.hits} / {props.total} 件。除外されたノードは消さずに残し、
        残ったノードだけが光ります。
      </Text>
      <Button label={props.filters.on ? '絞り込みを更新' : '絞り込みを適用'} onPress={props.onApply} />
      {props.filters.on ? (
        <Button label="絞り込みを解除" variant="ghost" size="medium" onPress={props.onClear} />
      ) : null}
      {!props.isPro ? <Text style={styles.meta}>絞り込みは Pro 限定です。</Text> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: color.bgSurface,
    borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet,
    borderTopWidth: 1, borderColor: '#262636',
  },
  grabber: {
    width: 38, height: 4, borderRadius: 2, backgroundColor: color.locked,
    alignSelf: 'center', marginTop: 9, marginBottom: 4,
  },
  body: { padding: 18, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { color: color.textPrimary, fontSize: 20, fontWeight: '700' },
  display: { color: color.textPrimary, fontSize: 28, fontWeight: '700', lineHeight: 36 },
  meta: { color: color.textSecondary, fontSize: 12, lineHeight: 18 },
  value: { color: color.textPrimary, fontSize: 14 },
  section: { color: color.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  checkedLine: { color: color.textSecondary, fontSize: 12 },
  star: { color: color.accentGlow, fontSize: 20 },
  tag: {
    alignSelf: 'flex-start', marginTop: 6, fontSize: 10.5, borderWidth: 1,
    borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden',
  },
  tagCore: { color: color.textPrimary, borderColor: '#4A4A5C' },
  tagRandom: { color: color.tierRandom, borderColor: color.tierBoundary },
  relRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  relSwatch: { width: 24, borderTopWidth: 2 },
  relText: { color: color.textPrimary, fontSize: 13.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6,
    borderWidth: 1, borderColor: color.hairline, backgroundColor: color.bgElevated,
  },
  chipText: { color: color.textSecondary, fontSize: 12 },
  serviceRow: { flexDirection: 'row', gap: 8 },
  plan: {
    borderWidth: 1, borderColor: color.hairline, borderRadius: 16,
    padding: 14, gap: 3, backgroundColor: color.bgElevated,
  },
  planOn: { borderColor: color.accent },
  planName: { color: color.textPrimary, fontSize: 14, fontWeight: '700' },
  planPrice: { color: color.textPrimary, fontSize: 17, fontWeight: '700' },
  genreRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1A1A23',
  },
  caret: { width: 20, alignItems: 'center' },
  caretText: { color: color.textSecondary, fontSize: 11 },
  gdot: { width: 9, height: 9, borderRadius: 3 },
  genreName: { flex: 1, color: color.textPrimary, fontSize: 14 },
  genreNameOn: { color: color.accentGlow, fontWeight: '700' },
  genreCount: { color: color.textSecondary, fontSize: 12 },
  link: { color: color.accentGlow, fontSize: 13 },
});
