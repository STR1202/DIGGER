import { useCallback, useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  Easing, runOnJS, useSharedValue, withTiming, type SharedValue,
} from 'react-native-reanimated';
import type { LaidOutNode, Layout } from '@diggr/core';

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 4;

export interface ViewSnapshot { scale: number; tx: number; ty: number }

export interface GraphView {
  readonly scale: SharedValue<number>;
  readonly tx: SharedValue<number>;
  readonly ty: SharedValue<number>;
  /** ラベル配置に使う JS 側のスナップショット。操作中は更新せず、離した時点で確定する */
  readonly snapshot: ViewSnapshot;
  readonly interacting: SharedValue<number>;
  readonly gesture: ReturnType<typeof Gesture.Simultaneous>;
  readonly centerOnSeed: (fit?: number) => void;
  readonly zoomBy: (factor: number) => void;
  readonly reset: (fit: number) => void;
}

export interface GraphViewCallbacks {
  onTapNode: (mbid: string) => void;
  onDoubleTapNode: (mbid: string) => void;
  onLongPressNode: (mbid: string, x: number, y: number) => void;
  onTapGhost: () => void;
  onTapEmpty: () => void;
}

interface Options {
  readonly layout: Layout;
  readonly revealed: number;
  readonly width: number;
  readonly height: number;
  readonly initialScale: number;
}

/**
 * ピンチ・パン・タップ。
 * 変形は Reanimated の共有値で 60fps のまま扱い、ラベルは操作が終わった時点で置き直す
 * （操作中はラベルを畳む）。ラベルを毎フレーム JS で組み直すとフレームを落とすため。
 */
export function useGraphView(opts: Options, cb: GraphViewCallbacks): GraphView {
  const { layout, revealed, width, height, initialScale } = opts;
  const scale = useSharedValue(initialScale);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const interacting = useSharedValue(0);
  const [snapshot, setSnapshot] = useState<ViewSnapshot>({ scale: initialScale, tx: 0, ty: 0 });

  const commit = useCallback((s: number, x: number, y: number) => {
    setSnapshot({ scale: s, tx: x, ty: y });
  }, []);

  /**
   * 視点を動かす。
   * ラベルの置き直し（commit）は動き終わってから行う。
   * 動いている最中に確定させると、キャンバスが移動している途中でラベルだけ先に
   * 目的地へ飛んでしまい、戻る動きが不自然に見えるため。
   */
  const animateTo = useCallback((s: number, x: number, y: number) => {
    const config = { duration: 420, easing: Easing.out(Easing.cubic) };
    scale.value = withTiming(s, config);
    tx.value = withTiming(x, config);
    ty.value = withTiming(y, config, (finished) => {
      if (finished) runOnJS(commit)(s, x, y);
    });
  }, [scale, tx, ty, commit]);

  /** 全体表示。地図がちょうど収まる倍率まで引いて中心に戻す。 */
  const fitAll = useCallback(() => {
    animateTo(initialScale, 0, 0);
  }, [animateTo, initialScale]);

  const hit = useCallback(
    (sx: number, sy: number): LaidOutNode | 'ghost' | null => {
      const wx = (sx - width / 2 - tx.value) / scale.value;
      const wy = (sy - height / 2 - ty.value) / scale.value;
      let best: LaidOutNode | null = null;
      let bd = Number.POSITIVE_INFINITY;
      for (const n of layout.nodes.slice(0, revealed)) {
        const d = Math.hypot(n.x - wx, n.y - wy);
        if (d < Math.max(n.r + 10, 16) && d < bd) { bd = d; best = n; }
      }
      if (best) return best;
      for (const g of layout.ghosts) {
        if (Math.hypot(g.x - wx, g.y - wy) < 13) return 'ghost';
      }
      return null;
    },
    [layout, revealed, width, height, scale, tx, ty],
  );

  const onTap = useCallback((sx: number, sy: number) => {
    const h = hit(sx, sy);
    if (h === 'ghost') cb.onTapGhost();
    else if (h) cb.onTapNode(h.mbid);
    else cb.onTapEmpty();
  }, [hit, cb]);

  const onDoubleTap = useCallback((sx: number, sy: number) => {
    const h = hit(sx, sy);
    if (h && h !== 'ghost') cb.onDoubleTapNode(h.mbid);
    // 「全体表示」ボタンを廃止した分、空白のダブルタップで全体に戻す
    else if (!h) fitAll();
  }, [hit, cb, fitAll]);

  const onLongPress = useCallback((sx: number, sy: number) => {
    const h = hit(sx, sy);
    if (h && h !== 'ghost') cb.onLongPressNode(h.mbid, sx, sy);
  }, [hit, cb]);

  const pan = Gesture.Pan()
    .minDistance(4)
    .onBegin(() => { interacting.value = 1; })
    .onChange((e) => {
      tx.value += e.changeX;
      ty.value += e.changeY;
    })
    .onFinalize(() => {
      interacting.value = 0;
      runOnJS(commit)(scale.value, tx.value, ty.value);
    });

  const pinch = Gesture.Pinch()
    .onBegin(() => { interacting.value = 1; })
    .onChange((e) => {
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale.value * e.scaleChange));
      // 2 本指の中点を固定したまま拡大する
      const fx = e.focalX - width / 2;
      const fy = e.focalY - height / 2;
      const k = next / scale.value;
      tx.value = fx - (fx - tx.value) * k;
      ty.value = fy - (fy - ty.value) * k;
      scale.value = next;
    })
    .onFinalize(() => {
      interacting.value = 0;
      runOnJS(commit)(scale.value, tx.value, ty.value);
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(320)
    .onEnd((e) => { runOnJS(onDoubleTap)(e.x, e.y); });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .maxDuration(320)
    .requireExternalGestureToFail(doubleTap)
    .onEnd((e) => { runOnJS(onTap)(e.x, e.y); });

  const longPress = Gesture.LongPress()
    .minDuration(520)
    .onStart((e) => { runOnJS(onLongPress)(e.x, e.y); });

  const gesture = Gesture.Simultaneous(
    pinch,
    pan,
    Gesture.Exclusive(doubleTap, longPress, singleTap),
  );

  return {
    scale, tx, ty, snapshot, interacting, gesture,
    centerOnSeed: (fit) => animateTo(fit ?? scale.value, 0, 0),
    zoomBy: (factor) => {
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale.value * factor));
      animateTo(next, tx.value * (next / scale.value), ty.value * (next / scale.value));
    },
    reset: (fit) => animateTo(fit, 0, 0),
  };
}
