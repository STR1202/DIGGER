import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { MMKV } from 'react-native-mmkv';
import { nextReveal, REVEAL_INITIAL, type DiggrMap, type Entitlement, type RelationType } from '@diggr/core';
import { FREE_ENTITLEMENT } from '@diggr/core';
import type { ServiceKey } from '../services/links';

const storage = new MMKV({ id: 'diggr' });

/** 履歴・ブックマークはノード集合ごと持つ（FR-02b）。乱数シードだけでは月次更新で別物になる。 */
export interface MapRecord {
  readonly id: string;
  readonly seedType: DiggrMap['seedType'];
  readonly seedKey: string;
  readonly seedName: string;
  readonly viewType: DiggrMap['viewType'];
  readonly genreId: string | null;
  readonly nodeMbids: readonly string[];
  readonly coreCount: number;
  readonly randomSeed: number;
  readonly randomOn: boolean;
  readonly schemaVersion: string;
  readonly parentMapId: string | null;
  readonly createdAt: string;
  readonly revealed: number;
}

export interface Filters {
  from: number;
  to: number;
  types: RelationType[];
  country: string | 'all';
  on: boolean;
}

interface Prefs {
  /** 検索時に選ぶランダム表示。既定はオフ（＝類似度順・人気順で決定的） */
  randomOn: boolean;
  service: ServiceKey | null;
  confirmBeforeLaunch: boolean;
  labelDense: boolean;
  relationColors: boolean;
  reduceMotion: boolean;
  onboarded: boolean;
}

interface AppState {
  prefs: Prefs;
  entitlement: Entitlement;
  filters: Filters;
  /** 詳細を開いた／聴きに行ったアーティスト */
  checked: string[];
  listened: string[];
  bookmarks: string[];
  history: MapRecord[];

  /** 表示中のマップ（永続化しない。履歴から復元する） */
  current: DiggrMap | null;
  revealed: number;
  selected: string | null;
  highlight: string[];

  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  setEntitlement: (e: Entitlement) => void;
  setFilters: (f: Partial<Filters>) => void;
  openMap: (map: DiggrMap, revealed?: number) => void;
  revealMore: (all?: boolean) => void;
  select: (mbid: string | null) => void;
  toggleHighlight: (genreId: string) => void;
  clearHighlight: () => void;
  markChecked: (mbid: string) => void;
  markListened: (mbid: string) => void;
  toggleBookmark: (key: string) => boolean;
  clearHistory: () => void;
  wipeAll: () => void;
}

const toRecord = (m: DiggrMap, revealed: number): MapRecord => ({
  id: m.id, seedType: m.seedType, seedKey: m.seedKey, seedName: m.seedName,
  viewType: m.viewType, genreId: m.genreId, nodeMbids: m.nodes.map((n) => n.mbid),
  coreCount: m.coreCount, randomSeed: m.randomSeed, randomOn: m.randomOn,
  schemaVersion: m.schemaVersion, parentMapId: m.parentMapId, createdAt: m.createdAt, revealed,
});

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      prefs: {
        randomOn: false,
        service: null,
        confirmBeforeLaunch: false,
        labelDense: true,
        relationColors: true,
        reduceMotion: false,
        onboarded: false,
      },
      entitlement: FREE_ENTITLEMENT,
      filters: { from: 1940, to: 2026, types: ['listen', 'collab', 'member', 'influence', 'label'], country: 'all', on: false },
      checked: [],
      listened: [],
      bookmarks: [],
      history: [],
      current: null,
      revealed: REVEAL_INITIAL,
      selected: null,
      highlight: [],

      setPref: (key, value) => set((s) => ({ prefs: { ...s.prefs, [key]: value } })),
      setEntitlement: (entitlement) => set({ entitlement }),
      setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),

      openMap: (map, revealed) => {
        const r = Math.min(map.nodes.length, revealed ?? REVEAL_INITIAL);
        set((s) => ({
          current: map,
          revealed: r,
          selected: null,
          highlight: [],
          history: [toRecord(map, r), ...s.history.filter((h) => h.id !== map.id)].slice(0, 60),
        }));
      },

      revealMore: (all = false) => {
        const { current, revealed } = get();
        if (!current) return;
        const next = nextReveal(revealed, current.nodes.length, all);
        set((s) => ({
          revealed: next,
          history: s.history.map((h) => (h.id === current.id ? { ...h, revealed: next } : h)),
        }));
      },

      select: (selected) => set({ selected }),
      toggleHighlight: (genreId) =>
        set((s) => ({
          highlight: s.highlight.includes(genreId)
            ? s.highlight.filter((g) => g !== genreId)
            : [...s.highlight, genreId],
        })),
      clearHighlight: () => set({ highlight: [] }),

      markChecked: (mbid) =>
        set((s) => (s.checked.includes(mbid) ? s : { checked: [...s.checked, mbid] })),
      markListened: (mbid) =>
        set((s) => ({
          listened: s.listened.includes(mbid) ? s.listened : [...s.listened, mbid],
          checked: s.checked.includes(mbid) ? s.checked : [...s.checked, mbid],
        })),

      toggleBookmark: (key) => {
        const { bookmarks, entitlement } = get();
        if (bookmarks.includes(key)) {
          set({ bookmarks: bookmarks.filter((b) => b !== key) });
          return false;
        }
        if (entitlement.plan === 'free' && bookmarks.length >= 10) return false;
        set({ bookmarks: [key, ...bookmarks] });
        return true;
      },

      clearHistory: () => set({ history: [] }),
      wipeAll: () =>
        set({
          checked: [], listened: [], bookmarks: [], history: [], current: null,
          revealed: REVEAL_INITIAL, selected: null, highlight: [],
          entitlement: FREE_ENTITLEMENT,
        }),
    }),
    {
      name: 'diggr-app',
      storage: createJSONStorage(() => ({
        getItem: (k) => storage.getString(k) ?? null,
        setItem: (k, v) => storage.set(k, v),
        removeItem: (k) => storage.delete(k),
      })),
      // 表示中のマップは持ち越さない（履歴から復元する）
      partialize: (s) => ({
        prefs: s.prefs, filters: s.filters, checked: s.checked, listened: s.listened,
        bookmarks: s.bookmarks, history: s.history,
      }),
    },
  ),
);
