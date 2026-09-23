"use client";

import { createElement } from "react";
import { ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, Equal, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { PriorityDTO } from "@/lib/portal-types";

function iconFor(priority: Pick<PriorityDTO, "name" | "order">): LucideIcon {
  const name = priority.name.toLowerCase();
  if (name.includes("highest")) return ChevronsUp;
  if (name.includes("high")) return ArrowUp;
  if (name.includes("lowest")) return ChevronsDown;
  if (name.includes("low")) return ArrowDown;
  if (name.includes("medium")) return Equal;
  // Fallback based on order (0 = lowest … 4 = highest)
  if (priority.order <= 1) return priority.order === 0 ? ChevronsDown : ArrowDown;
  if (priority.order >= 3) return priority.order === 4 ? ChevronsUp : ArrowUp;
  return Equal;
}

export function PriorityIcon({
  priority,
  size = 14,
  className,
}: {
  priority: Pick<PriorityDTO, "name" | "color" | "order"> | null;
  size?: number;
  className?: string;
}) {
  if (!priority) return null;
  return (
    <span
      role="img"
      aria-label={`Priority ${priority.name}`}
      title={`Priority: ${priority.name}`}
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
      style={{ color: priority.color }}
    >
      {createElement(iconFor(priority), { size, strokeWidth: 2.5 })}
    </span>
  );
}
