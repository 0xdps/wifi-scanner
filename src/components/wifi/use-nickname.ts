"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "wifi-scanner:nickname";

const listeners = new Set<() => void>();
let cached: string | null = null;

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): string {
  cached ??= window.localStorage.getItem(STORAGE_KEY) ?? "";
  return cached;
}

/** Empty on the server so hydration matches before localStorage is readable. */
function getServerSnapshot(): string {
  return "";
}

/**
 * A user-supplied name for the associated network, kept in this browser only.
 * macOS withholds the real SSID from unsigned callers, so this is often the only
 * way to see a human name on the link card.
 */
export function useNickname(): [string, (value: string) => void] {
  const nickname = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setNickname = useCallback((value: string) => {
    const trimmed = value.trim();
    cached = trimmed;
    if (trimmed) window.localStorage.setItem(STORAGE_KEY, trimmed);
    else window.localStorage.removeItem(STORAGE_KEY);
    emit();
  }, []);

  return [nickname, setNickname];
}
