import { useCallback, useRef, useState } from 'react';
import { AD_UNIT_IDS } from './ads';

/**
 * リワード広告による一時解放（SC-10 / §9.3）。視聴完了イベントでだけ `onEarned` を呼ぶ
 * （閉じただけ・スキップは呼ばない）。ネイティブモジュールが無い環境では
 * `unavailable` を返し、呼び出し側はボタンを無効化する。
 */
export function useRewardedAd(): {
  readonly loading: boolean;
  readonly show: () => Promise<'earned' | 'dismissed' | 'unavailable'>;
} {
  const [loading, setLoading] = useState(false);
  const loadedRef = useRef<unknown>(null);

  const show = useCallback(async (): Promise<'earned' | 'dismissed' | 'unavailable'> => {
    setLoading(true);
    try {
      const mod = await import('react-native-google-mobile-ads').catch(() => null);
      if (!mod) return 'unavailable';
      const { RewardedAd, RewardedAdEventType, AdEventType } = mod;
      const ad = RewardedAd.createForAdRequest(AD_UNIT_IDS.rewarded);
      loadedRef.current = ad;
      return await new Promise<'earned' | 'dismissed' | 'unavailable'>((resolve) => {
        let earned = false;
        const unsubEarned = ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => { earned = true; });
        const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
          unsubEarned();
          unsubClosed();
          resolve(earned ? 'earned' : 'dismissed');
        });
        const unsubError = ad.addAdEventListener(AdEventType.ERROR, () => {
          unsubEarned(); unsubClosed(); unsubError();
          resolve('unavailable');
        });
        const unsubLoaded = ad.addAdEventListener(AdEventType.LOADED, () => {
          unsubLoaded();
          ad.show();
        });
        ad.load();
      });
    } catch {
      return 'unavailable';
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, show };
}
