"use client";

import { cn } from "@/lib/utils";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const sizes = {
  xs: "size-5 text-[9px]",
  sm: "size-6 text-[10px]",
  md: "size-8 text-xs",
  lg: "size-10 text-sm",
  xl: "size-12 text-base",
} as const;

export function Avatar({
  name,
  color,
  size = "md",
  className,
  title,
}: {
  name: string;
  color: string;
  size?: keyof typeof sizes;
  className?: string;
  title?: string;
}) {
  return (
    <span
      role="img"
      aria-label={`${name} avatar`}
      title={title ?? name}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white ring-1 ring-black/5",
        sizes[size],
        className
      )}
      style={{ backgroundColor: color || "#78716c" }}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({
  people,
  max = 4,
  size = "sm",
}: {
  people: { name: string; avatarColor: string }[];
  max?: number;
  size?: keyof typeof sizes;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <div className="flex -space-x-1.5">
      {shown.map((p) => (
        <Avatar key={p.name} name={p.name} color={p.avatarColor} size={size} className="ring-2 ring-background" />
      ))}
      {rest > 0 && (
        <span
          className="inline-flex items-center justify-center rounded-full bg-stone-200 text-[10px] font-semibold text-stone-600 ring-2 ring-background"
          style={{ width: size === "sm" ? 24 : 32, height: size === "sm" ? 24 : 32 }}
        >
          +{rest}
        </span>
      )}
    </div>
  );
}
