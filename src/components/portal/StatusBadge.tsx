"use client";

import { cn } from "@/lib/utils";
import type { StatusDTO } from "@/lib/portal-types";

export function StatusBadge({
  status,
  className,
}: {
  status: Pick<StatusDTO, "name" | "color" | "category">;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-xs font-medium text-stone-700",
        className
      )}
    >
      <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: status.color }} />
      {status.name}
    </span>
  );
}

export function StatusDot({
  status,
  className,
}: {
  status: Pick<StatusDTO, "name" | "color">;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={`Status ${status.name}`}
      title={status.name}
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: status.color }}
    />
  );
}
