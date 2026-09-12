import jwt from 'jsonwebtoken';

/**
 * 匿名 JWT（基本設計書 FR-14）。
 *
 * 本番では `JWT_SECRET` を Secrets Manager 相当（技術選定書 §9.1 の `.env`）から注入する。
 * 開発時に未設定でも起動できるよう既定値を持たせるが、その場合は起動時に警告する。
 */
const SECRET = process.env['JWT_SECRET'] ?? 'dev-insecure-secret-change-me';
if (SECRET === 'dev-insecure-secret-change-me' && process.env['NODE_ENV'] === 'production') {
  throw new Error('JWT_SECRET must be set in production');
}

export interface TokenPayload {
  readonly sub: string;
  readonly anon: boolean;
}

export function signToken(userId: string, anon: boolean): string {
  return jwt.sign({ sub: userId, anon }, SECRET, { expiresIn: '180d' });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, SECRET);
    if (typeof decoded === 'string' || !decoded) return null;
    const sub = decoded['sub'];
    if (typeof sub !== 'string') return null;
    return { sub, anon: Boolean(decoded['anon']) };
  } catch {
    return null;
  }
}
