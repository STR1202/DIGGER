/** 画面設計書 §4.1–4.3 のデザイントークン。色・寸法はここだけで定義する。 */

export const color = {
  bgBase: '#0A0A0F',
  bgSurface: '#14141C',
  bgElevated: '#1E1E29',
  /** 上部クローム。地図に文字が食われないよう半透明で敷く（画面設計書 §4.1） */
  bgChrome: 'rgba(18,18,26,0.94)',
  textPrimary: '#F5F5F7',
  textSecondary: '#8E8E9A',
  accent: '#7C5CFF',
  accentGlow: '#B79CFF',
  tierCore: '#F5F5F7',
  tierRandom: '#9A9AB0',
  tierBoundary: '#2A2A38',
  locked: '#3A3A48',
  /** 閲覧済みチェックの白丸（FR-31）。textPrimary とは別に純白で固定する */
  stateChecked: '#FFFFFF',
  success: '#3DD68C',
  error: '#FF6B6B',
  hairline: '#23232F',
} as const;

/** ジャンル 8 系統。暗い背景に対してコントラスト比 4.5:1 以上を満たす明度に調整済み。 */
export const genreColor = {
  rock: '#FF7A6E',
  electronic: '#4FD1FF',
  hiphop: '#FFC857',
  jazz: '#7BE3B0',
  classical: '#C9A7FF',
  pop: '#FF8AD1',
  folk: '#9BD86E',
  experimental: '#8FA0FF',
} as const;

export type GenreColorKey = keyof typeof genreColor;

/** 関係タイプ（FR-21）。エッジ用の色とチップ用の色を分ける。
    共聴のエッジは仕様どおり低彩度だが、チップでそのまま使うと選択状態が読めないため。 */
export const relationStyle = {
  listen: { label: '共聴', edge: '#5C5C74', chip: '#7FD1FF', dash: null },
  collab: { label: '共演', edge: '#B79CFF', chip: '#B79CFF', dash: null },
  member: { label: 'メンバー', edge: '#B79CFF', chip: '#B79CFF', dash: null },
  influence: { label: '影響', edge: '#FFC857', chip: '#FFC857', dash: [5, 4] },
  label: { label: '同レーベル', edge: '#7BE3B0', chip: '#7BE3B0', dash: [1.5, 3.5] },
} as const;

export const space = (n: number): number => n * 4;

export const radius = {
  button: (height: number): number => height / 2, // §4.6.1 完全なピル
  card: 16,
  sheet: 24,
  input: 12,
} as const;

export const buttonHeight = { large: 52, medium: 44, small: 36 } as const;

export const font = {
  display: 'System',
  body: 'System',
  mono: 'Menlo',
} as const;

export const type = {
  display: { fontSize: 30, fontWeight: '700' },
  title: { fontSize: 21, fontWeight: '700' },
  body: { fontSize: 15, fontWeight: '400' },
  label: { fontSize: 14, fontWeight: '500' },
  caption: { fontSize: 12, fontWeight: '400' },
} as const;

export const shadow = {
  button: {
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  panel: {
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
} as const;

/** 画面設計書 §4.4 のモーション */
export const motion = {
  reveal: { duration: 220, stagger: 20 },
  edgeGrow: 420,
  redig: 700,
  sheet: 280,
  breathe: { normal: 1500, marked: 380 },
} as const;
