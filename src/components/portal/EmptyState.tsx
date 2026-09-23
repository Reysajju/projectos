"use client";

import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  hint,
  className,
  action,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-stone-300 bg-stone-50/60 px-6 py-10 text-center",
        className
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-stone-100">
        <Icon className="size-5 text-stone-400" aria-hidden />
      </div>
      <p className="text-sm font-medium text-stone-700">{title}</p>
      {hint && <p className="max-w-sm text-xs text-stone-500">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
