import type { RefObject } from 'react';
import type { View } from 'react-native';

/**
 * 画像共有（FR-17 / SC-14）。クライアント側で描画したものをそのまま画像にする。
 * サーバー通信は発生しない（画面設計書 §5.11）。
 */
export async function captureGraphImage(ref: RefObject<View>): Promise<string> {
  const { captureRef } = await import('react-native-view-shot');
  return captureRef(ref, { format: 'png', quality: 1 });
}

export async function shareImage(uri: string): Promise<void> {
  const Sharing = await import('expo-sharing');
  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error('sharing is not available on this device');
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'DIGGR の地図を共有' });
}

/** 写真ライブラリへの保存。権限を拒否されたら false を返す（呼び出し側でトースト等を出す）。 */
export async function saveImageToLibrary(uri: string): Promise<boolean> {
  const MediaLibrary = await import('expo-media-library');
  const perm = await MediaLibrary.requestPermissionsAsync();
  if (!perm.granted) return false;
  await MediaLibrary.saveToLibraryAsync(uri);
  return true;
}
