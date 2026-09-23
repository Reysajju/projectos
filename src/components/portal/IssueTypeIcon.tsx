"use client";

import { createElement } from "react";
import {
  BookOpen,
  BrainCircuit,
  Bug,
  CheckCircle2,
  Circle,
  FolderKanban,
  GitBranch,
  Globe,
  Layers,
  Palette,
  Rocket,
  Server,
  Shield,
  ShoppingBag,
  Smartphone,
  TestTube,
  TrendingUp,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { TypeDTO } from "@/lib/portal-types";

// Icon-name → component registry (icon strings come from the API, seeded by
// DEFAULT_ISSUE_TYPES / project icon picker).
const ICONS: Record<string, LucideIcon> = {
  layers: Layers,
  "book-open": BookOpen,
  "check-circle-2": CheckCircle2,
  bug: Bug,
  "git-branch": GitBranch,
  rocket: Rocket,
  smartphone: Smartphone,
  braincircuit: BrainCircuit,
  "folder-kanban": FolderKanban,
  wrench: Wrench,
  palette: Palette,
  "shopping-cart": ShoppingBag,
  server: Server,
  globe: Globe,
  shield: Shield,
  zap: Zap,
  flaskconical: TestTube,
  "trending-up": TrendingUp,
  circle: Circle,
};

export const PROJECT_ICON_CHOICES = [
  "rocket",
  "smartphone",
  "braincircuit",
  "folder-kanban",
  "wrench",
  "palette",
  "shopping-cart",
  "server",
  "globe",
  "shield",
  "zap",
  "flaskconical",
  "trending-up",
] as const;

export function resolveIcon(icon: string | undefined): LucideIcon {
  if (!icon) return Circle;
  return ICONS[icon] ?? Circle;
}

export function IssueTypeIcon({
  type,
  className,
  size = 14,
}: {
  type: Pick<TypeDTO, "icon" | "color" | "name">;
  className?: string;
  size?: number;
}) {
  return (
    <span
      role="img"
      aria-label={`${type.name} icon`}
      title={type.name}
      className={cn("inline-flex shrink-0 items-center justify-center", className)}
      style={{ color: type.color }}
    >
      {createElement(resolveIcon(type.icon), { size, strokeWidth: 2.25 })}
    </span>
  );
}

export function ProjectIcon({
  icon,
  color,
  className,
  size = 16,
}: {
  icon: string;
  color: string;
  className?: string;
  size?: number;
}) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-md text-white", className)}
      style={{ backgroundColor: color, width: size + 10, height: size + 10 }}
    >
      {createElement(resolveIcon(icon), { size, strokeWidth: 2.25 })}
    </span>
  );
}
