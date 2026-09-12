import { Platform } from 'react-native';

/**
 * 広告（FR-13 / §9.3）。Google AdMob をバナー・インタースティシャル・リワードの 3 形式で使う。
 *
 * `react-native-google-mobile-ads` はネイティブモジュールなので開発ビルドが必要
 * （Expo Go では動かない）。app.json の `androidAppId` / `iosAppId` は
 * **Google 公式のテスト用 App ID** を既定値にしてある。本番配信前に、
 * 自分の AdMob アカウントで発行した実 ID に必ず差し替えること。
 */

/** Google が配布しているテスト用広告ユニット ID（本番の値は EXPO_PUBLIC_ADMOB_* で上書きする）。 */
const TEST_UNITS = {
  banner: Platform.select({
    ios: 'ca-app-pub-3940256099942544/2934735716',
    android: 'ca-app-pub-3940256099942544/6300978111',
    default: 'ca-app-pub-3940256099942544/6300978111',
  }),
  rewarded: Platform.select({
    ios: 'ca-app-pub-3940256099942544/1712485313',
    android: 'ca-app-pub-3940256099942544/5224354917',
    default: 'ca-app-pub-3940256099942544/5224354917',
  }),
} as const;

export const AD_UNIT_IDS = {
  banner: process.env['EXPO_PUBLIC_ADMOB_BANNER_ID'] ?? TEST_UNITS.banner,
  rewarded: process.env['EXPO_PUBLIC_ADMOB_REWARDED_ID'] ?? TEST_UNITS.rewarded,
};

let initialized = false;

/**
 * ATT（iOS）→ UMP（GDPR/CMP）→ AdMob 初期化の順で行う。
 * 拒否しても全機能を使える設計なので、失敗は握りつぶして広告なしで進める。
 */
export async function initAds(): Promise<void> {
  if (initialized) return;
  initialized = true;
  try {
    if (Platform.OS === 'ios') {
      const { requestTrackingPermissionsAsync } = await import('expo-tracking-transparency');
      await requestTrackingPermissionsAsync().catch(() => undefined);
    }
    const { default: mobileAds, AdsConsent, AdsConsentStatus } = await import('react-native-google-mobile-ads');
    const info = await AdsConsent.requestInfoUpdate().catch(() => null);
    if (info?.isConsentFormAvailable && info.status === AdsConsentStatus.REQUIRED) {
      await AdsConsent.showForm().catch(() => undefined);
    }
    await mobileAds().initialize();
  } catch {
    // ネイティブモジュール未リンク（Expo Go・シミュレータの一部構成）では黙って広告なしにする。
    initialized = false;
  }
}
