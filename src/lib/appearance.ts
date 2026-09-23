"use client";

/**
 * Accent theme utility — persists the choice in localStorage and applies it
 * as `data-accent` on <html>. Paired with the CSS overrides in globals.css.
 */

export interface AccentOption {
  id: string;
  label: string;
  swatch: string;
  swatchDark: string;
}

export const ACCENTS: AccentOption[] = [
  { id: "amber", label: "Amber", swatch: "#d97706", swatchDark: "#f59e0b" },
  { id: "emerald", label: "Emerald", swatch: "#059669", swatchDark: "#10b981" },
  { id: "violet", label: "Violet", swatch: "#7c3aed", swatchDark: "#8b5cf6" },
  { id: "rose", label: "Rose", swatch: "#e11d48", swatchDark: "#f43f5e" },
];

const STORAGE_KEY = "pos-accent";

// Tiny pub/sub so React components can read the accent reactively
// (useSyncExternalStore) without any setState-in-effect patterns.
const subscribers = new Set<() => void>();

export function subscribeAccent(callback: () => void): () => void {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

export function getStoredAccent(): string {
  if (typeof window === "undefined") return "amber";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v && ACCENTS.some((a) => a.id === v) ? v : "amber";
}

export function applyAccent(accent: string): void {
  if (typeof document === "undefined") return;
  if (ACCENTS.some((a) => a.id === accent)) {
    document.documentElement.dataset.accent = accent;
  } else {
    delete document.documentElement.dataset.accent;
  }
}

export function setAccent(accent: string): void {
  applyAccent(accent);
  try {
    window.localStorage.setItem(STORAGE_KEY, accent);
  } catch {
    // private mode — accent just won't persist
  }
  for (const cb of subscribers) cb();
}

/** Inline head script (run before paint to avoid accent flash). */
export const ACCENT_BOOTSTRAP_SCRIPT = `try{var a=localStorage.getItem("${STORAGE_KEY}");if(a&&["amber","emerald","violet","rose"].includes(a))document.documentElement.dataset.accent=a;}catch(e){}`;
