import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAppStore } from '../state/store';
import { AD_UNIT_IDS } from '../services/ads';
import { color } from '../theme/tokens';

/**
 * バナー広告（FR-13）。Pro プランでは領域ごと消し、余白を残さない（画面設計書 §5.1 / §5.3）。
 * ネイティブモジュールが無い環境（Expo Go 等）では、枠だけのプレースホルダーに縮退する。
 */
export function AdBanner(): React.ReactElement | null {
  const isPro = useAppStore((s) => s.entitlement.plan !== 'free');
  const [Comp, setComp] = useState<React.ComponentType<{ unitId: string; size: string }> | null>(null);
  const [failed, setFailed] = useState(false);

  React.useEffect(() => {
    if (isPro) return;
    let cancelled = false;
    void import('react-native-google-mobile-ads')
      .then((mod) => {
        if (!cancelled) setComp(() => mod.BannerAd as unknown as React.ComponentType<{ unitId: string; size: string }>);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [isPro]);

  if (isPro) return null;

  if (!Comp) {
    return failed ? (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>広告</Text>
      </View>
    ) : null;
  }

  const AdComp = Comp;
  return (
    <View style={styles.wrap}>
      <AdComp unitId={AD_UNIT_IDS.banner} size="BANNER" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', minHeight: 50 },
  placeholder: {
    height: 50, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: color.tierBoundary,
    alignItems: 'center', justifyContent: 'center',
  },
  placeholderText: { color: color.textSecondary, fontSize: 11 },
});
