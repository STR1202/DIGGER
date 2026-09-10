import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { api } from '../src/api';
import { useAppStore } from '../src/state/store';
import { color } from '../src/theme/tokens';

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

export default function RootLayout(): React.ReactElement {
  const setEntitlement = useAppStore((s) => s.setEntitlement);

  useEffect(() => {
    // 権利はサーバーが正（ADR-08）。起動時に取得し、以降は購入・リワードで更新する。
    void api.entitlement().then(setEntitlement).catch(() => undefined);
  }, [setEntitlement]);

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
            <Stack.Screen name="map" options={{ animation: 'fade_from_bottom' }} />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
