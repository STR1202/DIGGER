import Constants from 'expo-constants';
import { HttpApi } from './http';
import { LocalApi } from './local';
import type { DiggrApi } from './types';

export * from './types';
export { ApiError } from './http';

const mode = process.env['EXPO_PUBLIC_API_MODE'] ?? 'local';
const baseUrl =
  process.env['EXPO_PUBLIC_API_BASE_URL'] ??
  (Constants.expoConfig?.extra?.['apiBaseUrl'] as string | undefined) ??
  'https://api.diggr.app/v1';

/** 匿名 JWT。実装では初回起動時に POST /auth/anonymous して SecureStore に保存する。 */
async function getToken(): Promise<string> {
  return process.env['EXPO_PUBLIC_DEV_TOKEN'] ?? 'anonymous-dev-token';
}

export const api: DiggrApi = mode === 'http' ? new HttpApi(baseUrl, getToken) : new LocalApi();

/** ローカル実装のときだけ、レール（開発用トグル）から権利を切り替えられるようにする */
export const localApi = api instanceof LocalApi ? api : null;
