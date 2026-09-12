import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { router } from 'expo-router';
import {
  fitScale, ghostPoints, layoutMap, placeLabels, MAX_NODES,
  type LaidOutNode, type MapNode,
} from '@diggr/core';
import { GraphCanvas } from '../src/graph/GraphCanvas';
import { GraphLabels } from '../src/graph/GraphLabels';
import { useGraphView } from '../src/graph/useGraphView';
import { Button } from '../src/components/Button';
import { ViewTypeSwitch } from '../src/components/ViewTypeSwitch';
import { ArtistSheet, FilterSheet, GenrePanel, Paywall, ShareSheet } from '../src/sheets';
import { useAppStore } from '../src/state/store';
import { api } from '../src/api';
import { categoryOf, facetsOf } from '../src/data/genres';
import { color, motion, shadow } from '../src/theme/tokens';
import { openInService, type ServiceKey } from '../src/services/links';
import { purchases } from '../src/services/purchases';
import { useRewardedAd } from '../src/services/reward';
import { captureGraphImage, saveImageToLibrary, shareImage } from '../src/services/shareImage';

/** ラベル幅の概算（半角 6.4px / 全角 11px @11px）。実測は不要で、離す距離が決まればよい。 */
const measureLabel = (t: string): number =>
  [...t].reduce((w, c) => w + (c.charCodeAt(0) < 0x2e80 ? 6.4 : 11), 0);

export default function MapScreen(): React.ReactElement | null {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const map = useAppStore((s) => s.current);
  const revealed = useAppStore((s) => s.revealed);
  const selected = useAppStore((s) => s.selected);
  const filters = useAppStore((s) => s.filters);
  const prefs = useAppStore((s) => s.prefs);
  const entitlement = useAppStore((s) => s.entitlement);
  const checked = useAppStore((s) => s.checked);
  const listened = useAppStore((s) => s.listened);
  const bookmarks = useAppStore((s) => s.bookmarks);
  const store = useAppStore.getState;

  const [sheetNode, setSheetNode] = useState<MapNode | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [showGenre, setShowGenre] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [shareUri, setShareUri] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const rewardedAd = useRewardedAd();
  const graphRef = useRef<View>(null);

  const openShare = useCallback(() => {
    setMenuOpen(false);
    setShowShare(true);
    setShareUri(null);
    setShareLoading(true);
    // シートのアニメーションが割り込まないよう、次のフレームでキャプチャする
    requestAnimationFrame(() => {
      void captureGraphImage(graphRef)
        .then(setShareUri)
        .catch(() => setShareUri(null))
        .finally(() => setShareLoading(false));
    });
  }, []);

  const canvasHeight = height;
  const layout = useMemo(() => {
    if (!map) return null;
    const l = layoutMap(map, { measureLabel }, undefined);
    return { ...l, ghosts: ghostPoints(map.ghosts, l.extent, map.seedKey) };
  }, [map]);

  const fit = layout ? fitScale(layout.extent, width, canvasHeight) : 1;
  const facets = useMemo(
    () => (map ? facetsOf(map.nodes.slice(0, revealed)) : []),
    [map, revealed],
  );
  const checkedSet = useMemo(() => new Set(checked), [checked]);
  const listenedSet = useMemo(() => new Set(listened), [listened]);

  const isExcluded = useCallback((n: LaidOutNode): boolean => {
    if (!filters.on) return false;
    if ((n.beginYear ?? 0) < filters.from || (n.beginYear ?? 9999) > filters.to) return true;
    if (filters.country !== 'all' && n.country !== filters.country) return true;
    if (n.relationTypes.length && !n.relationTypes.some((t) => filters.types.includes(t))) return true;
    return false;
  }, [filters]);

  const highlight = useAppStore((s) => s.highlight);
  const marking = filters.on || highlight.length > 0;
  const isLit = useMemo(() => (marking
    ? (n: LaidOutNode): boolean => !isExcluded(n)
      && (highlight.length === 0 || n.genres.some((g) => highlight.includes(g)))
    : null), [marking, isExcluded, highlight]);

  const view = useGraphView(
    { layout: layout ?? { nodes: [], ghosts: [], islands: [], extent: 100 }, revealed, width, height: canvasHeight, initialScale: fit },
    {
      onTapNode: (mbid) => {
        const n = map?.nodes.find((x) => x.mbid === mbid) ?? null;
        if (!n) return;
        store().select(mbid);
        store().markChecked(mbid);
        setSheetNode(n);
      },
      onDoubleTapNode: (mbid) => { void dig(mbid); },
      onLongPressNode: (mbid) => {
        const n = map?.nodes.find((x) => x.mbid === mbid) ?? null;
        if (n) setSheetNode(n);
      },
      onTapGhost: () => setShowPaywall(true),
      onTapEmpty: () => store().select(null),
    },
  );

  // 呼吸（通常はゆっくり全体、絞り込み中は対象だけ速く）
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (prefs.reduceMotion) { pulse.value = 1; return; }
    pulse.value = 0;
    pulse.value = withRepeat(
      withTiming(1, { duration: marking ? motion.breathe.marked : motion.breathe.normal }),
      -1, true,
    );
  }, [marking, prefs.reduceMotion, pulse]);

  // 段階表示で伸びるルート
  const grow = useSharedValue(1);
  useEffect(() => {
    if (prefs.reduceMotion) { grow.value = 1; return; }
    grow.value = 0;
    grow.value = withTiming(1, { duration: motion.edgeGrow });
  }, [revealed, map?.id, prefs.reduceMotion, grow]);

  const labels = useMemo(() => {
    if (!layout || !map) return [];
    return placeLabels({
      nodes: layout.nodes,
      islands: layout.islands,
      revealed,
      scale: view.snapshot.scale,
      offsetX: width / 2 + view.snapshot.tx,
      offsetY: canvasHeight / 2 + view.snapshot.ty,
      width,
      height: canvasHeight,
      reserved: [{
        x: width / 2 + view.snapshot.tx - 100, y: canvasHeight / 2 + view.snapshot.ty - 70,
        w: 200, h: 116,
      }],
      isExcluded,
      isGenreView: map.viewType === 'genre',
      selected,
      ...(prefs.labelDense ? {} : {}),
    });
  }, [layout, map, revealed, view.snapshot, width, canvasHeight, isExcluded, selected, prefs.labelDense]);

  const dig = useCallback(async (mbid: string) => {
    setSheetNode(null);
    const next = await api.createMap({
      seedType: 'artist', seedKey: mbid, viewType: 'related', randomOn: prefs.randomOn,
    });
    store().openMap(next);
  }, [prefs.randomOn]);

  const switchView = useCallback(async (v: 'related' | 'genre') => {
    if (!map) return;
    const cached = store().history.find(
      (h) => h.seedKey === map.seedKey && h.viewType === v && h.seedType === map.seedType,
    );
    const next = cached
      ? await api.getMap(cached.id).catch(() => null)
      : null;
    if (next) { store().openMap(next, cached?.revealed); return; }
    const created = await api.createMap({
      seedType: map.seedType, seedKey: map.seedKey, viewType: v, randomOn: prefs.randomOn,
    });
    store().openMap(created);
  }, [map, prefs.randomOn]);

  const digGenre = useCallback(async (genreId: string) => {
    setShowGenre(false);
    const next = await api.createMap({
      seedType: 'genre', seedKey: genreId, viewType: 'genre', randomOn: prefs.randomOn,
    });
    store().openMap(next);
  }, [prefs.randomOn]);

  const reroll = useCallback(async () => {
    if (!map?.canReroll) return;
    const next = await api.reroll(map.id);
    store().openMap(next);
  }, [map]);

  const onListen = useCallback(async (service: ServiceKey) => {
    if (!sheetNode) return;
    store().markListened(sheetNode.mbid, service);
    void api.markListened(sheetNode.mbid);
    setSheetNode(null);
    await openInService(service, sheetNode.name);
  }, [sheetNode]);

  useEffect(() => {
    // 直接この URL を開いた・アプリを再起動した等でマップが無いときは検索へ戻す
    if (!map) router.replace('/');
  }, [map]);

  if (!map || !layout) return null;

  const rest = map.nodes.length - revealed;
  const isPro = entitlement.plan !== 'free';
  const hidden = Math.max(map.ghosts, MAX_NODES - map.nodes.length);
  const countries = [...new Set(map.nodes.slice(0, revealed).map((n) => n.country ?? ''))]
    .filter(Boolean).sort();
  const hits = map.nodes.slice(0, revealed)
    .filter((n) => !isExcluded(n as unknown as LaidOutNode)).length;

  return (
    <View style={styles.root}>
      <GestureDetector gesture={view.gesture}>
        <View ref={graphRef} collapsable={false} style={StyleSheet.absoluteFill}>
          <GraphCanvas
            map={map} layout={layout} revealed={revealed}
            width={width} height={canvasHeight}
            tx={view.tx} ty={view.ty} scale={view.scale} grow={grow} pulse={pulse}
            selected={selected} checked={checkedSet} listened={listenedSet}
            relationColors={prefs.relationColors}
            isLit={isLit} isExcluded={isExcluded} categoryOf={categoryOf}
          />
          <GraphLabels
            labels={labels} islands={layout.islands} revealed={revealed}
            seedName={map.seedName} seedType={map.seedType}
            scale={view.snapshot.scale}
            offsetX={width / 2 + view.snapshot.tx}
            offsetY={canvasHeight / 2 + view.snapshot.ty}
            centerX={width / 2} centerY={canvasHeight / 2}
            liveScale={view.scale} liveTx={view.tx} liveTy={view.ty}
            interacting={view.interacting} checked={checkedSet}
          />
        </View>
      </GestureDetector>

      {/* 上部クローム。マップに重ならないよう、枠のあるパネルに収める */}
      <View style={[styles.chrome, { top: insets.top + 6 }]} pointerEvents="box-none">
        <View style={[styles.header, shadow.panel]}>
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="戻る">
            <Text style={styles.icon}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>{map.seedName}</Text>
            <Text style={styles.meta} numberOfLines={1}>
              {map.viewType === 'genre'
                ? `同一ジャンル・${map.randomOn ? 'ランダム' : '人気順'} · 島 ${layout.islands.length}`
                : `確定 ${map.coreCount} ＋ ${map.randomOn ? 'ランダム' : '類似度順'} ${map.nodes.length - map.coreCount}`}
              {` · ${revealed} / ${map.nodes.length} 表示`}
            </Text>
          </View>
          <Pressable onPress={() => setMenuOpen((v) => !v)} hitSlop={8} accessibilityLabel="メニュー">
            <Text style={styles.icon}>⋮</Text>
          </Pressable>
        </View>
        <ViewTypeSwitch
          value={map.viewType}
          onChange={switchView}
          hidden={map.seedType === 'genre'}
          relatedLocked={map.seedType === 'artist' && !map.seedHasGraph}
          lockedCaption="この人の関連グラフはまだありません。ジャンル地図で探せます"
        />
        {menuOpen ? (
          <View style={[styles.menu, shadow.panel]}>
            <Pressable onPress={() => { setMenuOpen(false); void reroll(); }} disabled={!map.canReroll}>
              <Text style={[styles.menuItem, !map.canReroll && styles.menuItemOff]}>
                🎲 引き直す（外周だけ）
              </Text>
            </Pressable>
            <Pressable onPress={() => { setMenuOpen(false); setShowFilter(true); }}>
              <Text style={styles.menuItem}>絞り込み</Text>
            </Pressable>
            <Pressable onPress={openShare}>
              <Text style={styles.menuItem}>🖼 画像で共有</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* 下部クローム */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]} pointerEvents="box-none">
        {rest > 0 ? (
          <Button
            label={`＋ さらに ${Math.min(10, rest)} 件`}
            sub={`あと ${rest} 件`}
            progress={revealed / map.nodes.length}
            onPress={() => store().revealMore(false)}
            onLongPress={() => store().revealMore(true)}
          />
        ) : isPro ? (
          <Button label={`全 ${map.nodes.length} 件を表示中`} disabled progress={1} />
        ) : (
          <Button label={`🔒 もっとディグる（＋${hidden}）`} sub="確定枠も外側も広がります"
            variant="locked" progress={1} onPress={() => setShowPaywall(true)} />
        )}
        <View style={styles.actions}>
          <Button label={`ジャンル ${facets.length}`} variant="ghost" size="small" style={{ flex: 1 }}
            onPress={() => setShowGenre(true)} />
          <Button label="絞込" variant="ghost" size="small" style={{ flex: 1 }}
            onPress={() => setShowFilter(true)} />
          <Button label="中心に戻る" variant="ghost" size="small" style={{ flex: 1 }}
            onPress={() => view.centerOnSeed()} />
        </View>
      </View>

      <ArtistSheet
        node={sheetNode} map={map} service={prefs.service}
        listened={sheetNode ? listenedSet.has(sheetNode.mbid) : false}
        bookmarked={sheetNode ? bookmarks.some((b) => b.targetType === 'artist' && b.targetKey === sheetNode.mbid) : false}
        onClose={() => setSheetNode(null)}
        onDig={(mbid) => { void dig(mbid); }}
        onListen={(s) => { void onListen(s); }}
        onBookmark={() => { if (sheetNode) store().toggleBookmark('artist', sheetNode.mbid, sheetNode.name); }}
      />
      <FilterSheet
        open={showFilter} filters={filters} countries={countries}
        hits={hits} total={revealed} isPro={isPro}
        onChange={(f) => store().setFilters(f)}
        onApply={() => {
          if (!isPro) { setShowFilter(false); setShowPaywall(true); return; }
          store().setFilters({ on: true });
          setShowFilter(false);
        }}
        onClear={() => { store().setFilters({ on: false }); setShowFilter(false); }}
        onClose={() => setShowFilter(false)}
      />
      <GenrePanel
        open={showGenre} facets={facets} highlight={highlight}
        onToggle={(g) => store().toggleHighlight(g)}
        onClear={() => store().clearHighlight()}
        onDig={(g) => { void digGenre(g); }}
        onClose={() => setShowGenre(false)}
      />
      <Paywall
        open={showPaywall} hidden={hidden} seedName={map.seedName}
        onClose={() => setShowPaywall(false)}
        onPurchase={(plan) => {
          void purchases.purchase(plan).then((e) => {
            store().setEntitlement(e);
            setShowPaywall(false);
            void api.getMap(map.id).then((m) => store().openMap(m, revealed));
          });
        }}
        onRestore={() => {
          void purchases.restore().then((e) => {
            store().setEntitlement(e);
            if (e.plan !== 'free') {
              setShowPaywall(false);
              void api.getMap(map.id).then((m) => store().openMap(m, revealed));
            }
          });
        }}
        onWatchAd={entitlement.plan === 'free' ? () => {
          void rewardedAd.show().then((result) => {
            if (result !== 'earned') return;
            void api.claimReward().then((e) => {
              store().setEntitlement(e);
              setShowPaywall(false);
              void api.getMap(map.id).then((m) => store().openMap(m, revealed));
            });
          });
        } : undefined}
      />
      <ShareSheet
        open={showShare} imageUri={shareUri} loading={shareLoading}
        onClose={() => setShowShare(false)}
        onShare={() => { if (shareUri) void shareImage(shareUri).catch(() => undefined); }}
        onSave={() => {
          if (!shareUri) return;
          void saveImageToLibrary(shareUri).then((ok) => {
            if (!ok) Alert.alert('保存できませんでした', '写真ライブラリへのアクセスが許可されていません。');
          });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgBase },
  chrome: { position: 'absolute', left: 10, right: 10, gap: 6 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8,
    borderRadius: 20, backgroundColor: color.bgChrome,
    borderWidth: 1, borderColor: color.hairline,
  },
  icon: { color: color.textSecondary, fontSize: 22, paddingHorizontal: 8 },
  title: { color: color.textPrimary, fontSize: 18, fontWeight: '700' },
  meta: { color: color.textSecondary, fontSize: 11 },
  menu: {
    alignSelf: 'flex-end', backgroundColor: color.bgElevated, borderRadius: 14,
    borderWidth: 1, borderColor: '#2E2E3E', padding: 5, minWidth: 200,
  },
  menuItem: { color: color.textPrimary, fontSize: 13.5, padding: 10 },
  menuItemOff: { opacity: 0.4 },
  bottom: {
    position: 'absolute', left: 12, right: 12, bottom: 0, gap: 10, paddingTop: 26,
  },
  actions: { flexDirection: 'row', gap: 8 },
});
