import Constants from 'expo-constants';
import { HttpApi } from './http';
import { LocalApi } from './local';
import { ensureSession } from '../services/auth';
import type { DiggrApi } from './types';

export * from './types';
export { ApiError } from './http';

const mode = process.env['EXPO_PUBLIC_API_MODE'] ?? 'local';
const baseUrl =
  process.env['EXPO_PUBLIC_API_BASE_URL'] ??
  (Constants.expoConfig?.extra?.['apiBaseUrl'] as string | undefined) ??
  'https://api.diggr.app/v1';

/** 匿名 JWT（FR-14）。初回は `POST /auth/anonymous` を叩き、以後は SecureStore の値を使い回す。 */
async function getToken(): Promise<string> {
  const dev = process.env['EXPO_PUBLIC_DEV_TOKEN'];
  if (dev) return dev;
  const session = await ensureSession(baseUrl);
  return session.token;
}

export const api: DiggrApi = mode === 'http' ? new HttpApi(baseUrl, getToken) : new LocalApi();

/** ローカル実装のときだけ、レール（開発用トグル）から権利を切り替えられるようにする */
export const localApi = api instanceof LocalApi ? api : null;
