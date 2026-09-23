"use client";

import { CalendarClock, GitBranch, MessageSquare } from "lucide-react";

import type { IssueDTO } from "@/lib/portal-types";
import { cn } from "@/lib/utils";
import { Avatar } from "./Avatar";
import { IssueTypeIcon } from "./IssueTypeIcon";
import { KeyBadge } from "./KeyBadge";
import { isOverdue, formatDateShort } from "./RelativeTime";
import { PriorityIcon } from "./PriorityIcon";

export function IssueCardBody({ issue, dragging }: { issue: IssueDTO; dragging?: boolean }) {
  const dueSoon =
    issue.dueDate &&
    !isOverdue(issue.dueDate) &&
    new Date(issue.dueDate).getTime() - Date.now() < 3 * 86_400_000;

  return (
    <div
      className={cn(
        "rounded-lg border border-stone-200 bg-white p-3 shadow-sm transition-shadow",
        !dragging && "hover:border-stone-300 hover:shadow",
        dragging && "rotate-2 shadow-lg ring-2 ring-amber-500/40"
      )}
    >
      {/* labels */}
      {issue.labels.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {issue.labels.slice(0, 3).map((l) => (
            <span
              key={l.id}
              className="rounded px-1.5 py-px text-[10px] font-medium"
              style={{ backgroundColor: `${l.color}1a`, color: l.color }}
            >
              {l.name}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2">
        <IssueTypeIcon type={issue.type} className="mt-0.5" />
        <p className="line-clamp-2 min-w-0 flex-1 text-sm font-medium leading-snug text-stone-800">
          {issue.summary}
        </p>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <KeyBadge>{issue.key}</KeyBadge>
        {issue.storyPoints != null && (
          <span
            className="inline-flex items-center rounded px-1.5 py-px text-[10px] font-semibold"
            title={`${issue.storyPoints} story points`}
            style={{ backgroundColor: "#f5f5f4", color: "#57534e" }}
          >
            {issue.storyPoints} pt
          </span>
        )}
        {issue.subtaskCount > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-stone-400" title="Subtasks">
            <GitBranch className="size-3" aria-hidden />
            {issue.subtasksDone}/{issue.subtaskCount}
          </span>
        )}
        {issue.commentCount > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-stone-400" title={`${issue.commentCount} comments`}>
            <MessageSquare className="size-3" aria-hidden />
            {issue.commentCount}
          </span>
        )}
        {issue.dueDate && (
          <span
            className={cn(
              "ml-auto hidden items-center gap-0.5 rounded px-1 py-px text-[10px] sm:inline-flex",
              isOverdue(issue.dueDate)
                ? "bg-rose-100 font-medium text-rose-700"
                : dueSoon
                  ? "bg-amber-100 font-medium text-amber-800"
                  : "text-stone-400"
            )}
          >
            <CalendarClock className="size-3" aria-hidden />
            {formatDateShort(issue.dueDate)}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <PriorityIcon priority={issue.priority} />
        {issue.assignee ? (
          <Avatar name={issue.assignee.name} color={issue.assignee.avatarColor} size="sm" />
        ) : (
          <span className="flex size-6 items-center justify-center rounded-full border border-dashed border-stone-300 text-[9px] text-stone-400">
            ?
          </span>
        )}
      </div>
    </div>
  );
}
