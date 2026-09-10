import type { Entitlement, Plan } from '@diggr/core';
import { FREE_ENTITLEMENT, PRO_ENTITLEMENT } from '@diggr/core';

/**
 * 課金（FR-12 / ADR-07）。RevenueCat 経由の StoreKit 2 / Play Billing を想定する。
 *
 * react-native-purchases はネイティブモジュールなので Expo Go では動かない。
 * ここは薄いインターフェイスにしておき、開発ビルドでのみ実装を差し込む。
 * 権利の正はサーバー（entitlements テーブル）で、これは購入フローの起動だけを担う。
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

/**
 * 本番実装の骨組み。開発ビルドで react-native-purchases を入れてから有効にする。
 *
 * import Purchases from 'react-native-purchases';
 * await Purchases.configure({ apiKey, appUserID: userId });
 * const offerings = await Purchases.getOfferings();
 * const { customerInfo } = await Purchases.purchasePackage(pkg);
 * → customerInfo.entitlements.active['pro'] を見て権利を作る。
 * Webhook 側（services/api）で entitlements テーブルを更新するのが正で、
 * アプリ側の戻り値は表示を先に進めるためだけに使う。
 */
export const purchases: PurchaseGateway = new StubPurchases();
