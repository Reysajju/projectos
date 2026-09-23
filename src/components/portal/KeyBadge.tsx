"use client";

import { cn } from "@/lib/utils";

export function KeyBadge({ children, className }: { children: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded border border-border bg-muted px-1.5 py-px font-mono text-[11px] font-medium tracking-tight text-muted-foreground",
        className
      )}
    >
      {children}
    </span>
  );
}
