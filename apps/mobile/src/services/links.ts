import * as Linking from 'expo-linking';

/**
 * 外部音楽アプリ連携（FR-23）。
 * SDK も API キーも規約同意も要らない。公開 URL を開くだけ。
 */
export const SERVICES = {
  spotify: {
    name: 'Spotify',
    short: 'Spotify',
    url: (name: string) => `https://open.spotify.com/search/${encodeURIComponent(name)}`,
  },
  apple: {
    name: 'Apple Music',
    short: 'Apple',
    url: (name: string) => `https://music.apple.com/search?term=${encodeURIComponent(name)}`,
  },
  ytmusic: {
    name: 'YouTube Music',
    short: 'YT Music',
    url: (name: string) => `https://music.youtube.com/search?q=${encodeURIComponent(name)}`,
  },
  itunes: {
    name: 'iTunes Store',
    short: 'iTunes',
    url: (name: string) =>
      `itmss://itunes.apple.com/search?media=music&term=${encodeURIComponent(name)}`,
  },
} as const;

export type ServiceKey = keyof typeof SERVICES;
export const SERVICE_KEYS = Object.keys(SERVICES) as ServiceKey[];

/**
 * 未インストールなら OS がブラウザかストアへフォールバックする。
 * itmss: だけは開けないことがあるので https にも落とす。
 */
export async function openInService(service: ServiceKey, artistName: string): Promise<void> {
  const url = SERVICES[service].url(artistName);
  const canOpen = await Linking.canOpenURL(url).catch(() => false);
  if (canOpen) {
    await Linking.openURL(url);
    return;
  }
  const fallback = url.startsWith('itmss://')
    ? `https://music.apple.com/search?term=${encodeURIComponent(artistName)}`
    : url;
  await Linking.openURL(fallback);
}
