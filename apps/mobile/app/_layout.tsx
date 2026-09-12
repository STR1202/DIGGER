import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { api } from '../src/api';
import { initDb } from '../src/db';
import { getPurchaseUserId } from '../src/services/auth';
import { initAds } from '../src/services/ads';
import { purchases } from '../src/services/purchases';
import { useAppStore } from '../src/state/store';
import { color } from '../src/theme/tokens';

const API_MODE = process.env['EXPO_PUBLIC_API_MODE'] ?? 'local';
const API_BASE_URL =
  process.env['EXPO_PUBLIC_API_BASE_URL'] ??
  (Constants.expoConfig?.extra?.['apiBaseUrl'] as string | undefined) ??
  'https://api.diggr.app/v1';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Redis の TTL（§7.3）と揃える。地図そのものは不変なので長めでよい。
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 2,
    },
  },
});

export default function RootLayout(): React.ReactElement | null {
  const setEntitlement = useAppStore((s) => s.setEntitlement);
  const hydrate = useAppStore((s) => s.hydrate);
  const onboarded = useAppStore((s) => s.prefs.onboarded);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // SC-01: 端末 DB（履歴・ブックマーク・チェック済み）を読み終えるまでは何も描かない。
    // 壊れていた場合は initDb が黙って作り直す（基本設計書 R-39）。
    void (async () => {
      await initDb();
      await hydrate();
      setReady(true);
    })();
  }, [hydrate]);

  useEffect(() => {
    // SC-02: 初回だけオンボーディングへ。以後は起動のたびに読む prefs（MMKV）で判定する。
    if (ready && !onboarded) router.replace('/onboarding');
  }, [ready, onboarded]);

  useEffect(() => {
    if (!ready) return;
    // 権利はサーバーが正（ADR-08）。起動時に取得し、以降は購入・リワードで更新する。
    void api.entitlement().then(setEntitlement).catch(() => undefined);
    // 課金・広告 SDK の初期化。API キー未設定やネイティブモジュール未リンクのときは
    // それぞれ静かにスタブへ縮退する（purchases.ts / ads.ts）。
    void getPurchaseUserId(API_BASE_URL, API_MODE)
      .then((userId) => purchases.configure(userId))
      .catch(() => undefined);
    void initAds();
  }, [ready, setEntitlement]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: color.bgBase }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.bgBase }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: color.bgBase },
              animation: 'fade',
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="map" options={{ animation: 'fade_from_bottom' }} />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
