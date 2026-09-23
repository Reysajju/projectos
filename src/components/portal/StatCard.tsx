"use client";

import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function StatCard({
  icon: Icon,
  label,
  value,
  tint = "amber",
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  tint?: "amber" | "emerald" | "violet" | "rose" | "stone";
  hint?: string;
}) {
  const tints: Record<string, { bg: string; fg: string; glow: string }> = {
    amber: { bg: "bg-amber-500/15 dark:bg-amber-500/20", fg: "text-amber-600 dark:text-amber-400", glow: "shadow-amber-600/10" },
    emerald: { bg: "bg-emerald-500/15 dark:bg-emerald-500/20", fg: "text-emerald-600 dark:text-emerald-400", glow: "shadow-emerald-600/10" },
    violet: { bg: "bg-violet-500/15 dark:bg-violet-500/20", fg: "text-violet-600 dark:text-violet-400", glow: "shadow-violet-600/10" },
    rose: { bg: "bg-rose-500/15 dark:bg-rose-500/20", fg: "text-rose-600 dark:text-rose-400", glow: "shadow-rose-600/10" },
    stone: { bg: "bg-muted", fg: "text-muted-foreground", glow: "shadow-stone-600/5" },
  };
  const t = tints[tint];
  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 overflow-hidden rounded-lg border border-border bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-muted-foreground/25 hover:shadow-md",
        t.glow
      )}
    >
      {/* soft accent wash */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-6 -top-6 size-20 rounded-full opacity-60 blur-2xl transition-opacity group-hover:opacity-90",
          t.bg
        )}
      />
      <div className={cn("relative flex size-10 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105", t.bg)}>
        <Icon className={cn("size-5", t.fg)} aria-hidden />
      </div>
      <div className="relative min-w-0">
        <div className="text-2xl font-semibold leading-6 tabular-nums text-foreground">{value}</div>
        <div className="truncate text-xs text-muted-foreground">
          {label}
          {hint ? ` · ${hint}` : ""}
        </div>
      </div>
    </div>
  );
}
