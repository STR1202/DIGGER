import * as SecureStore from 'expo-secure-store';

/**
 * 匿名 JWT の発行と保管（基本設計書 FR-14）。
 * 初回起動時に `POST /auth/anonymous` を叩き、以後は SecureStore に保存したトークンを使い回す。
 * SecureStore は端末のキーチェーン／Keystore を使うので、MMKV より機微な値の置き場に適する。
 */
const TOKEN_KEY = 'diggr.auth.token';
const USER_ID_KEY = 'diggr.auth.userId';

export interface AuthSession {
  readonly token: string;
  readonly userId: string;
}

let cached: AuthSession | null = null;

async function readStored(): Promise<AuthSession | null> {
  const [token, userId] = await Promise.all([
    SecureStore.getItemAsync(TOKEN_KEY),
    SecureStore.getItemAsync(USER_ID_KEY),
  ]);
  return token && userId ? { token, userId } : null;
}

async function persist(session: AuthSession): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(TOKEN_KEY, session.token),
    SecureStore.setItemAsync(USER_ID_KEY, session.userId),
  ]);
  cached = session;
}

/** 端末にトークンが無ければ発行する。あれば何もしない（サーバーの JWT 有効期限は 180 日）。 */
export async function ensureSession(baseUrl: string): Promise<AuthSession> {
  if (cached) return cached;
  const stored = await readStored();
  if (stored) {
    cached = stored;
    return stored;
  }
  const res = await fetch(`${baseUrl}/auth/anonymous`, { method: 'POST' });
  if (!res.ok) throw new Error(`failed to create anonymous session: ${res.status}`);
  const body = (await res.json()) as { token: string; userId: string };
  await persist(body);
  return body;
}

/** Apple / Google 連携（SC-13）。成功したら新しいトークンに差し替える。 */
export async function linkAccount(
  baseUrl: string, provider: 'apple' | 'google', identityToken: string,
): Promise<AuthSession> {
  const current = await ensureSession(baseUrl);
  const res = await fetch(`${baseUrl}/auth/link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${current.token}` },
    body: JSON.stringify({ provider, identityToken, userId: current.userId }),
  });
  if (!res.ok) throw new Error(`failed to link ${provider} account: ${res.status}`);
  const body = (await res.json()) as { token: string; userId: string };
  await persist(body);
  return body;
}

/**
 * RevenueCat の `appUserID` に使う安定 ID。HTTP モードではサーバーの `userId` と揃え、
 * Webhook（`app_user_id`）が自社ユーザーとそのまま突合できるようにする。
 * ローカルモード（サーバー無し）では端末だけで完結する ID を発行して使い回す。
 */
export async function getPurchaseUserId(baseUrl: string, mode: string): Promise<string> {
  if (mode === 'http') return (await ensureSession(baseUrl)).userId;
  const key = 'diggr.auth.localId';
  const existing = await SecureStore.getItemAsync(key);
  if (existing) return existing;
  const id = `local-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  await SecureStore.setItemAsync(key, id);
  return id;
}

/** アカウント削除（SC-12）。端末側のトークンだけ消す。サーバー側の削除は別途 `DELETE /me` を呼ぶ。 */
export async function forgetSession(): Promise<void> {
  cached = null;
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY),
    SecureStore.deleteItemAsync(USER_ID_KEY),
  ]);
}
