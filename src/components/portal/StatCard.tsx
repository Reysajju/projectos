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
  const tints: Record<string, { bg: string; fg: string }> = {
    amber: { bg: "bg-amber-100/70", fg: "text-amber-700" },
    emerald: { bg: "bg-emerald-100/70", fg: "text-emerald-700" },
    violet: { bg: "bg-violet-100/70", fg: "text-violet-700" },
    rose: { bg: "bg-rose-100/70", fg: "text-rose-700" },
    stone: { bg: "bg-stone-100", fg: "text-stone-600" },
  };
  const t = tints[tint];
  return (
    <div className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white p-4 shadow-sm transition-shadow hover:shadow">
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", t.bg)}>
        <Icon className={cn("size-5", t.fg)} aria-hidden />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-semibold leading-6 text-stone-900">{value}</div>
        <div className="truncate text-xs text-stone-500">
          {label}
          {hint ? ` · ${hint}` : ""}
        </div>
      </div>
    </div>
  );
}
