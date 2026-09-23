"use client";

import { useEffect } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";
import { applyAccent, getStoredAccent } from "@/lib/appearance";

export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  // Re-apply the persisted accent after mount (the head bootstrap script
  // covers first paint; this covers SPA navigations and storage changes).
  useEffect(() => {
    applyAccent(getStoredAccent());
    const onStorage = (e: StorageEvent) => {
      if (e.key === "pos-accent") applyAccent(getStoredAccent());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
