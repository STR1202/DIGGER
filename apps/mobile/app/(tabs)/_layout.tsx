import React from 'react';
import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { color } from '../../src/theme/tokens';

const icon = (glyph: string) => ({ color }: { color: string }) => (
  <Text style={{ color, fontSize: 18 }}>{glyph}</Text>
);

export default function TabsLayout(): React.ReactElement {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'rgba(10,10,15,0.94)',
          borderTopColor: color.hairline,
        },
        tabBarActiveTintColor: color.accentGlow,
        tabBarInactiveTintColor: color.textSecondary,
        tabBarLabelStyle: { fontSize: 10.5 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: '検索', tabBarIcon: icon('⌕') }} />
      <Tabs.Screen name="library" options={{ title: 'マイディグ', tabBarIcon: icon('◷') }} />
      <Tabs.Screen name="settings" options={{ title: '設定', tabBarIcon: icon('≡') }} />
    </Tabs>
  );
}
