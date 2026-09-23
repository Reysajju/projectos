"use client";

import { format, formatDistanceToNow, isValid } from "date-fns";

export function RelativeTime({ date, className, prefix }: { date: string; className?: string; prefix?: string }) {
  const d = new Date(date);
  if (!isValid(d)) return <span className={className}>—</span>;
  return (
    <time dateTime={date} className={className} title={format(d, "MMM d, yyyy h:mm a")}>
      {prefix ?? ""}
      {formatDistanceToNow(d, { addSuffix: true })}
    </time>
  );
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  if (!isValid(d)) return "—";
  return format(d, "MMM d, yyyy");
}

export function formatDateShort(date: string | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  if (!isValid(d)) return "—";
  return format(d, "MMM d");
}

export function isOverdue(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false;
  const d = new Date(dueDate);
  return isValid(d) && d.getTime() < Date.now();
}
