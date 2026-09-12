import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { MMKV } from 'react-native-mmkv';
import { nextReveal, REVEAL_INITIAL, type DiggrMap, type Entitlement, type RelationType } from '@diggr/core';
import { FREE_ENTITLEMENT } from '@diggr/core';
import type { ServiceKey } from '../services/links';
import {
  addBookmark, cacheNodes, clearArtistsCache, clearHistory as dbClearHistory,
  collectPendingSync, listBookmarks, listChecked, listHistory, listListened,
  markChecked as dbMarkChecked, markListened as dbMarkListened, markSynced,
  pruneHistory, removeBookmark, saveMap, touchMap, updateRevealed, wipeAllMaps,
  wipeInteractions, type Bookmark, type MapRecord,
} from '../db';

export type { MapRecord, Bookmark };

/** 端末に持たせる小さな設定値のみ MMKV（技術選定書 §3.3・ADR-25）。履歴・ブックマーク・
 * チェック済みは expo-sqlite が正なので、ここでは永続化しない。 */
const settings = new MMKV({ id: 'diggr-settings' });

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
  /** 起動時に端末 DB から履歴・ブックマーク・チェック済みを読み終えたか */
  hydrated: boolean;
  prefs: Prefs;
  entitlement: Entitlement;
  filters: Filters;
  /** 詳細を開いた／聴きに行ったアーティスト */
  checked: string[];
  listened: string[];
  bookmarks: Bookmark[];
  history: MapRecord[];

  /** 表示中のマップ（永続化しない。履歴から復元する） */
  current: DiggrMap | null;
  revealed: number;
  selected: string | null;
  highlight: string[];

  hydrate: () => Promise<void>;
  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  setEntitlement: (e: Entitlement) => void;
  setFilters: (f: Partial<Filters>) => void;
  openMap: (map: DiggrMap, revealed?: number) => void;
  revealMore: (all?: boolean) => void;
  select: (mbid: string | null) => void;
  toggleHighlight: (genreId: string) => void;
  clearHighlight: () => void;
  markChecked: (mbid: string) => void;
  markListened: (mbid: string, service: string) => void;
  toggleBookmark: (targetType: Bookmark['targetType'], targetKey: string, targetName: string) => boolean;
  reloadHistory: () => Promise<void>;
  clearHistory: () => void;
  wipeAll: () => void;
  /** 端末に溜まった未同期の操作をサーバーへ送る（`/me/sync`、技術選定書 §3.5.3） */
  syncNow: (send: (pending: Awaited<ReturnType<typeof collectPendingSync>>) => Promise<void>) => Promise<void>;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      hydrated: false,
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

      /** 起動時に一度だけ呼ぶ。端末 DB から履歴・ブックマーク・チェック済みを読み込む。 */
      hydrate: async () => {
        const [checked, listened, bookmarks, history] = await Promise.all([
          listChecked(), listListened(), listBookmarks(), listHistory({ limit: 60 }),
        ]);
        set({ checked, listened, bookmarks, history, hydrated: true });
      },

      setPref: (key, value) => set((s) => ({ prefs: { ...s.prefs, [key]: value } })),
      setEntitlement: (entitlement) => set({ entitlement }),
      setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),

      openMap: (map, revealed) => {
        const r = Math.min(map.nodes.length, revealed ?? REVEAL_INITIAL);
        set({ current: map, revealed: r, selected: null, highlight: [] });
        // 端末 DB への書き込みは非同期・非ブロッキング。ノード集合は不変なので
        // 既存マップなら revealed だけ更新し、新規なら保存する（saveMap が判定する）。
        void (async () => {
          await saveMap(map, r);
          await touchMap(map.id);
          await cacheNodes(map.nodes);
          await pruneHistory(60);
          await get().reloadHistory();
        })();
      },

      reloadHistory: async () => {
        const history = await listHistory({ limit: 60 });
        set({ history });
      },

      revealMore: (all = false) => {
        const { current, revealed } = get();
        if (!current) return;
        const next = nextReveal(revealed, current.nodes.length, all);
        set({ revealed: next });
        void updateRevealed(current.id, next).then(() => get().reloadHistory());
      },

      select: (selected) => set({ selected }),
      toggleHighlight: (genreId) =>
        set((s) => ({
          highlight: s.highlight.includes(genreId)
            ? s.highlight.filter((g) => g !== genreId)
            : [...s.highlight, genreId],
        })),
      clearHighlight: () => set({ highlight: [] }),

      markChecked: (mbid) => {
        set((s) => (s.checked.includes(mbid) ? s : { checked: [...s.checked, mbid] }));
        void dbMarkChecked(mbid);
      },
      markListened: (mbid, service) => {
        set((s) => ({
          listened: s.listened.includes(mbid) ? s.listened : [...s.listened, mbid],
          checked: s.checked.includes(mbid) ? s.checked : [...s.checked, mbid],
        }));
        void dbMarkListened(mbid, service);
      },

      toggleBookmark: (targetType, targetKey, targetName) => {
        const { bookmarks, entitlement } = get();
        const already = bookmarks.some((b) => b.targetType === targetType && b.targetKey === targetKey);
        if (already) {
          set({ bookmarks: bookmarks.filter((b) => !(b.targetType === targetType && b.targetKey === targetKey)) });
          void removeBookmark(targetType, targetKey);
          return false;
        }
        if (entitlement.plan === 'free' && bookmarks.length >= 10) return false;
        const optimistic: Bookmark = {
          id: `${targetType}:${targetKey}`, targetType, targetKey, targetName,
          createdAt: new Date().toISOString(),
        };
        set({ bookmarks: [optimistic, ...bookmarks] });
        void addBookmark(targetType, targetKey, targetName);
        return true;
      },

      clearHistory: () => {
        set({ history: get().history.filter((h) => get().bookmarks.some((b) => b.targetType === 'map' && b.targetKey === h.id)) });
        void dbClearHistory().then(() => get().reloadHistory());
      },

      wipeAll: () => {
        set({
          checked: [], listened: [], bookmarks: [], history: [], current: null,
          revealed: REVEAL_INITIAL, selected: null, highlight: [],
          entitlement: FREE_ENTITLEMENT,
        });
        void Promise.all([wipeAllMaps(), wipeInteractions(), clearArtistsCache()]);
      },

      syncNow: async (send) => {
        const pending = await collectPendingSync();
        if (!pending.bookmarks.length && !pending.checked.length && !pending.listened.length) return;
        await send(pending);
        await markSynced();
      },
    }),
    {
      name: 'diggr-app',
      storage: createJSONStorage(() => ({
        getItem: (k) => settings.getString(k) ?? null,
        setItem: (k, v) => settings.set(k, v),
        removeItem: (k) => settings.delete(k),
      })),
      // 端末 DB（expo-sqlite）が正になった項目は MMKV に二重で持たない。
      partialize: (s) => ({ prefs: s.prefs, filters: s.filters }),
    },
  ),
);
