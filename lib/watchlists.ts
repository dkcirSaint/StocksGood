"use client";

import { useCallback, useEffect, useState } from "react";

export interface WatchItem {
  stockId: string;
  stockName: string;
}

export interface Watchlist {
  id: string;
  name: string;
  items: WatchItem[];
}

const STORAGE_KEY = "ff_watchlists";
const SELECTED_KEY = "ff_selected_list";
const DEFAULT_LIST_NAME = "觀察清單";

function genId(): string {
  return `wl_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function loadLists(): Watchlist[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (l) => l && typeof l.id === "string" && typeof l.name === "string"
    );
  } catch {
    return [];
  }
}

export interface UseWatchlists {
  ready: boolean;
  lists: Watchlist[];
  selectedId: string | null;
  selectedList: Watchlist | null;
  selectList: (id: string) => void;
  createList: (name: string) => Watchlist;
  renameList: (id: string, name: string) => void;
  deleteList: (id: string) => void;
  /** 回傳是否實際加入（false 代表已存在） */
  addItem: (listId: string, item: WatchItem) => boolean;
  removeItem: (listId: string, stockId: string) => void;
}

/** 股票是否在任一追蹤列表中 */
export function isStockWatched(
  stockId: string,
  lists: Watchlist[]
): boolean {
  return lists.some((l) => l.items.some((it) => it.stockId === stockId));
}

/** 以代號或名稱比對追蹤列表中的股票 */
export function findWatchedStockByQuery(
  query: string,
  lists: Watchlist[]
): WatchItem | null {
  const q = query.trim();
  if (!q) return null;
  for (const list of lists) {
    const hit = list.items.find(
      (it) => it.stockId === q || it.stockName === q
    );
    if (hit) return hit;
  }
  return null;
}

export function useWatchlists(): UseWatchlists {
  const [ready, setReady] = useState(false);
  const [lists, setLists] = useState<Watchlist[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 初次載入：自 localStorage 還原，若無則建立預設列表
  useEffect(() => {
    let loaded = loadLists();
    if (loaded.length === 0) {
      loaded = [{ id: genId(), name: DEFAULT_LIST_NAME, items: [] }];
    }
    const savedSelected =
      typeof window !== "undefined"
        ? window.localStorage.getItem(SELECTED_KEY)
        : null;
    const selected =
      loaded.find((l) => l.id === savedSelected)?.id ?? loaded[0].id;
    setLists(loaded);
    setSelectedId(selected);
    setReady(true);
  }, []);

  // 變更時持久化
  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
  }, [lists, ready]);

  useEffect(() => {
    if (!ready || !selectedId) return;
    window.localStorage.setItem(SELECTED_KEY, selectedId);
  }, [selectedId, ready]);

  const selectList = useCallback((id: string) => setSelectedId(id), []);

  const createList = useCallback((name: string): Watchlist => {
    const list: Watchlist = { id: genId(), name: name.trim(), items: [] };
    setLists((prev) => [...prev, list]);
    setSelectedId(list.id);
    return list;
  }, []);

  const renameList = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setLists((prev) =>
      prev.map((l) => (l.id === id ? { ...l, name: trimmed } : l))
    );
  }, []);

  const deleteList = useCallback(
    (id: string) => {
      setLists((prev) => {
        const next = prev.filter((l) => l.id !== id);
        if (selectedId === id) {
          setSelectedId(next.length > 0 ? next[0].id : null);
        }
        return next;
      });
    },
    [selectedId]
  );

  const addItem = useCallback(
    (listId: string, item: WatchItem): boolean => {
      let added = false;
      setLists((prev) =>
        prev.map((l) => {
          if (l.id !== listId) return l;
          if (l.items.some((it) => it.stockId === item.stockId)) return l;
          added = true;
          return { ...l, items: [...l.items, item] };
        })
      );
      return added;
    },
    []
  );

  const removeItem = useCallback((listId: string, stockId: string) => {
    setLists((prev) =>
      prev.map((l) =>
        l.id === listId
          ? { ...l, items: l.items.filter((it) => it.stockId !== stockId) }
          : l
      )
    );
  }, []);

  const selectedList = lists.find((l) => l.id === selectedId) ?? null;

  return {
    ready,
    lists,
    selectedId,
    selectedList,
    selectList,
    createList,
    renameList,
    deleteList,
    addItem,
    removeItem,
  };
}
