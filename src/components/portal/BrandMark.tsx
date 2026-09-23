"use client";

/**
 * ProjectOS brand mark — inline SVG so it renders instantly with zero
 * network requests and can be recolored per context. Ascending amber bars
 * (kanban lanes → velocity) with an emerald "done" dot.
 */

export function BrandMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="ProjectOS logo"
      className={className}
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id="posm-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#33302b" />
          <stop offset="1" stopColor="#191614" />
        </linearGradient>
        <linearGradient id="posm-amber" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#d97706" />
          <stop offset="1" stopColor="#fbbf24" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="14" fill="url(#posm-bg)" />
      <rect x="14" y="37" width="9" height="13" rx="2.5" fill="url(#posm-amber)" />
      <rect x="27.5" y="28" width="9" height="22" rx="2.5" fill="url(#posm-amber)" />
      <rect x="41" y="16" width="9" height="34" rx="2.5" fill="url(#posm-amber)" />
      <circle cx="18.5" cy="21" r="3.2" fill="#10b981" />
    </svg>
  );
}

/** Mark + wordmark lockup (used on the auth screen and empty states). */
export function BrandLockup({
  size = 38,
  dark = false,
  className,
}: {
  size?: number;
  dark?: boolean;
  className?: string;
}) {
  const text = dark ? "text-stone-100" : "text-foreground";
  return (
    <span className={className ?? "flex items-center gap-2.5"}>
      <BrandMark size={size} />
      <span className="flex flex-col leading-none">
        <span className={`text-lg font-bold tracking-tight ${text}`}>
          Project<span className="text-amber-600">OS</span>
        </span>
        <span className={`mt-1 text-[10px] font-medium uppercase tracking-[0.14em] ${dark ? "text-stone-400" : "text-muted-foreground"}`}>
          Project Management Portal
        </span>
      </span>
    </span>
  );
}
