import { Platform } from 'react-native';
import type { Entitlement, Plan } from '@diggr/core';
import { FREE_ENTITLEMENT, PRO_ENTITLEMENT } from '@diggr/core';

/**
 * 課金（FR-12 / ADR-07）。RevenueCat 経由の StoreKit 2 / Play Billing。
 *
 * 権利の正はサーバー（entitlements テーブル、RevenueCat Webhook が更新）であり、
 * ここでの戻り値は「表示を先に進めるため」だけに使う（UC-02）。実際の反映は
 * `services/api` の `/webhooks/revenuecat` が届いてから確定する。
 */
export const PRODUCTS = {
  pro_monthly: 'diggr.pro.monthly',
  pro_yearly: 'diggr.pro.yearly',
} as const satisfies Record<Exclude<Plan, 'free'>, string>;

export interface PurchaseGateway {
  configure(userId: string): Promise<void>;
  purchase(plan: Exclude<Plan, 'free'>): Promise<Entitlement>;
  restore(): Promise<Entitlement>;
}

/** 開発・Expo Go 用のスタブ。ストアを呼ばずに権利だけ切り替える。 */
export class StubPurchases implements PurchaseGateway {
  async configure(): Promise<void> {}
  async purchase(plan: Exclude<Plan, 'free'>): Promise<Entitlement> {
    return { plan, ...PRO_ENTITLEMENT, expiresAt: null };
  }
  async restore(): Promise<Entitlement> {
    return FREE_ENTITLEMENT;
  }
}

function readApiKey(): string | undefined {
  return Platform.OS === 'ios'
    ? process.env['EXPO_PUBLIC_REVENUECAT_IOS_KEY']
    : process.env['EXPO_PUBLIC_REVENUECAT_ANDROID_KEY'];
}

/**
 * 本番実装。`react-native-purchases` はネイティブモジュールなので Expo Go では動かない
 * （開発ビルドが必要、技術選定書 §2「開発上の制約」）。API キー未設定のときは
 * `configure` が例外を投げ、呼び出し側（_layout.tsx）は StubPurchases にフォールバックする。
 */
export class RevenueCatPurchases implements PurchaseGateway {
  private configured = false;

  async configure(userId: string): Promise<void> {
    if (this.configured) return;
    const apiKey = readApiKey();
    if (!apiKey) throw new Error('RevenueCat API key is not configured for this platform');
    const { default: Purchases, LOG_LEVEL } = await import('react-native-purchases');
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({ apiKey, appUserID: userId });
    this.configured = true;
  }

  async purchase(plan: Exclude<Plan, 'free'>): Promise<Entitlement> {
    const { default: Purchases } = await import('react-native-purchases');
    const offerings = await Purchases.getOfferings();
    const pkg = offerings.current?.availablePackages.find(
      (p) => p.product.identifier === PRODUCTS[plan],
    );
    if (!pkg) throw new Error(`RevenueCat package not found for ${PRODUCTS[plan]}`);
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return toEntitlement(customerInfo);
  }

  async restore(): Promise<Entitlement> {
    const { default: Purchases } = await import('react-native-purchases');
    const customerInfo = await Purchases.restorePurchases();
    return toEntitlement(customerInfo);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toEntitlement(customerInfo: any): Entitlement {
  const active = customerInfo.entitlements.active['pro'];
  if (!active) return FREE_ENTITLEMENT;
  const plan: Plan = active.productIdentifier === PRODUCTS.pro_yearly ? 'pro_yearly' : 'pro_monthly';
  return { plan, ...PRO_ENTITLEMENT, expiresAt: active.expirationDate ?? null };
}

/**
 * API キーが設定されているときだけ RevenueCat を使い、無ければスタブに留まる。
 * `configure()` の失敗（キー未設定・開発ビルドでない等）も同じくスタブへフォールバックする。
 */
export const purchases: PurchaseGateway = readApiKey() ? new RevenueCatPurchases() : new StubPurchases();
