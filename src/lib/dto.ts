import type { Prisma } from "@prisma/client";
import type {
  Activity,
  Attachment,
  Comment,
  CustomField,
  IssueLink,
  IssueType,
  Label,
  Notification,
  Organization,
  Priority,
  Sprint,
  Status,
  User,
  Webhook,
  WebhookDelivery,
} from "@prisma/client";

// ─── DTOs — single source of truth is ./portal-types ────────────
// (historically these were duplicated here and drifted; now re-exported)

import type {
  UserDTO, OrgDTO, MemberDTO,
  ProjectDTO,
  TypeDTO, StatusDTO, PriorityDTO, LabelDTO,
  CustomFieldDTO,
  SprintDTO,
  CommentDTO, ActivityDTO, NotificationDTO,
  IssueDTO,
  AttachmentDTO, WebhookDTO, WebhookDeliveryDTO,
  IssueLinkType, LinkedIssueDTO,
} from "./portal-types";

export type {
  UserDTO, OrgDTO, MemberDTO,
  ProjectDTO,
  TypeDTO, StatusDTO, PriorityDTO, LabelDTO,
  CustomFieldType, CustomFieldDTO,
  SprintDTO,
  CommentDTO, ActivityDTO, NotificationDTO,
  IssueDTO,
  AttachmentDTO, WebhookDTO, WebhookDeliveryDTO,
  IssueLinkType, LinkedIssueDTO,
} from "./portal-types";

// ─── Shared Prisma includes (keeps select-shapes consistent) ────

export const issueInclude = {
  type: true,
  status: true,
  priority: true,
  assignee: true,
  reporter: true,
  project: { select: { key: true, name: true } },
  labels: { include: { label: true } },
  subtasks: { select: { status: { select: { category: true } } } },
  _count: { select: { comments: true, subtasks: true, attachments: true, linksFrom: true, linksTo: true } },
} satisfies Prisma.IssueInclude;

export type IssueWithRelations = Prisma.IssueGetPayload<{ include: typeof issueInclude }>;
export type ActivityWithUser = Prisma.ActivityGetPayload<{ include: { user: true } }>;
export type CommentWithAuthor = Prisma.CommentGetPayload<{ include: { author: true } }>;
export type ProjectWithRelations = Prisma.ProjectGetPayload<{
  include: { lead: true; _count: { select: { issues: true } } };
}>;
export type MemberWithUser = Prisma.OrganizationMemberGetPayload<{ include: { user: true } }>;

// ─── Mappers ────────────────────────────────────────────────────

export function toUserDTO(u: User): UserDTO {
  return { id: u.id, name: u.name, email: u.email, avatarColor: u.avatarColor, title: u.title ?? null };
}

export function toOrgDTO(o: Organization): OrgDTO {
  return { id: o.id, name: o.name, slug: o.slug };
}

export function toMemberDTO(m: MemberWithUser): MemberDTO {
  return { ...toUserDTO(m.user), role: m.role };
}

export function toTypeDTO(t: IssueType): TypeDTO {
  return { id: t.id, name: t.name, color: t.color, icon: t.icon, order: t.order };
}

export function toStatusDTO(s: Status): StatusDTO {
  return { id: s.id, name: s.name, category: s.category as StatusDTO["category"], color: s.color, order: s.order };
}

export function toPriorityDTO(p: Priority): PriorityDTO {
  return { id: p.id, name: p.name, color: p.color, order: p.order };
}

export function toLabelDTO(l: Label): LabelDTO {
  return { id: l.id, name: l.name, color: l.color };
}

export function toCustomFieldDTO(f: CustomField): CustomFieldDTO {
  let options: string[] = [];
  if (f.options) {
    try {
      const parsed: unknown = JSON.parse(f.options);
      if (Array.isArray(parsed)) options = parsed.filter((o): o is string => typeof o === "string");
    } catch {
      options = [];
    }
  }
  return { id: f.id, name: f.name, type: f.type as CustomFieldDTO["type"], options, order: f.order };
}

/** Parse a JSON object column safely into a plain string-keyed record. */
export function parseJsonRecord(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (v == null) continue;
      out[k] = typeof v === "string" ? v : String(v);
    }
    return out;
  } catch {
    return {};
  }
}

/** Parse the project wipLimits JSON column into { statusId: limit }. */
export function parseWipLimits(raw: string | null): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n) && n > 0) out[k] = Math.round(n);
    }
    return out;
  } catch {
    return {};
  }
}

export function toProjectDTO(p: ProjectWithRelations): ProjectDTO {
  return {
    id: p.id,
    key: p.key,
    name: p.name,
    description: p.description ?? null,
    color: p.color,
    icon: p.icon,
    lead: p.lead ? toUserDTO(p.lead) : null,
    archived: p.archivedAt != null,
    issueCount: p._count.issues,
    wipLimits: parseWipLimits(p.wipLimits),
  };
}

export function toSprintDTO(s: Sprint): SprintDTO {
  return {
    id: s.id,
    projectId: s.projectId,
    name: s.name,
    goal: s.goal ?? null,
    startDate: s.startDate ? s.startDate.toISOString() : null,
    endDate: s.endDate ? s.endDate.toISOString() : null,
    status: s.status as SprintDTO["status"],
    order: s.order,
  };
}

export function toCommentDTO(c: CommentWithAuthor): CommentDTO {
  return { id: c.id, body: c.body, createdAt: c.createdAt.toISOString(), author: toUserDTO(c.author) };
}

export function toActivityDTO(a: ActivityWithUser): ActivityDTO {
  return {
    id: a.id,
    type: a.type,
    field: a.field ?? null,
    oldValue: a.oldValue ?? null,
    newValue: a.newValue ?? null,
    createdAt: a.createdAt.toISOString(),
    user: toUserDTO(a.user),
    issueId: a.issueId ?? null,
  };
}

export function toNotificationDTO(n: Notification): NotificationDTO {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body ?? null,
    issueId: n.issueId ?? null,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  };
}

export type AttachmentWithUploader = Prisma.AttachmentGetPayload<{ include: { uploadedBy: true } }>;

export function toAttachmentDTO(a: AttachmentWithUploader): AttachmentDTO {
  return {
    id: a.id,
    originalName: a.originalName,
    mimeType: a.mimeType,
    size: a.size,
    checksum: a.checksum.slice(0, 12),
    isImage: a.mimeType.startsWith("image/"),
    createdAt: a.createdAt.toISOString(),
    uploader: toUserDTO(a.uploadedBy),
  };
}

export function parseWebhookEvents(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((e): e is string => typeof e === "string") : [];
  } catch {
    return [];
  }
}

export type WebhookWithRelations = Prisma.WebhookGetPayload<{
  include: { creator: true; deliveries: { orderBy: { createdAt: "desc" }; take: 10 } };
}>;

export function toWebhookDTO(w: WebhookWithRelations): WebhookDTO {
  const deliveries = w.deliveries;
  return {
    id: w.id,
    url: w.url,
    events: parseWebhookEvents(w.events),
    description: w.description ?? null,
    active: w.active,
    createdAt: w.createdAt.toISOString(),
    creator: toUserDTO(w.creator),
    stats: {
      total: deliveries.length,
      succeeded: deliveries.filter((d) => d.status === "SUCCESS").length,
    },
    deliveries: deliveries.map(toWebhookDeliveryDTO),
  };
}

export function toWebhookDeliveryDTO(d: WebhookDelivery): WebhookDeliveryDTO {
  return {
    id: d.id,
    event: d.event,
    status: d.status as WebhookDeliveryDTO["status"],
    responseCode: d.responseCode ?? null,
    durationMs: d.durationMs ?? null,
    error: d.error ?? null,
    createdAt: d.createdAt.toISOString(),
  };
}

export function toIssueDTO(i: IssueWithRelations): IssueDTO {
  return {
    id: i.id,
    key: i.key,
    number: i.number,
    summary: i.summary,
    description: i.description ?? null,
    typeId: i.typeId,
    type: toTypeDTO(i.type),
    statusId: i.statusId,
    status: toStatusDTO(i.status),
    priorityId: i.priorityId ?? null,
    priority: i.priority ? toPriorityDTO(i.priority) : null,
    assigneeId: i.assigneeId ?? null,
    assignee: i.assignee ? toUserDTO(i.assignee) : null,
    reporterId: i.reporterId ?? null,
    reporter: i.reporter ? toUserDTO(i.reporter) : null,
    labels: i.labels.map((il) => toLabelDTO(il.label)),
    storyPoints: i.storyPoints ?? null,
    startDate: i.startDate ? i.startDate.toISOString() : null,
    dueDate: i.dueDate ? i.dueDate.toISOString() : null,
    estimateHours: i.estimateHours ?? null,
    remainingHours: i.remainingHours ?? null,
    sprintId: i.sprintId ?? null,
    parentId: i.parentId ?? null,
    order: i.order,
    projectId: i.projectId,
    projectKey: i.project.key,
    projectName: i.project.name,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
    commentCount: i._count.comments,
    subtaskCount: i._count.subtasks,
    subtasksDone: i.subtasks.filter((st) => st.status.category === "DONE").length,
    attachmentCount: i._count.attachments,
    linkCount: i._count.linksFrom + i._count.linksTo,
    customFields: parseJsonRecord(i.customFields),
  };
}

// ─── Issue links (blueprint §16) ────────────────────────────

export type IssueLinkWithEnds = Prisma.IssueLinkGetPayload<{
  include: {
    source: { include: { type: true; status: true; priority: true } };
    target: { include: { type: true; status: true; priority: true } };
    createdBy: true;
  };
}>;

/** Describe a link from the perspective of `issueId` (one of the two ends). */
export function toLinkedIssueDTO(link: IssueLinkWithEnds, issueId: string): LinkedIssueDTO {
  const outward = link.sourceId === issueId;
  const other = outward ? link.target : link.source;
  return {
    linkId: link.id,
    type: link.type as IssueLinkType,
    direction: outward ? "outward" : "inward",
    other: {
      id: other.id,
      key: other.key,
      summary: other.summary,
      typeName: other.type.name,
      typeIcon: other.type.icon,
      typeColor: other.type.color,
      statusName: other.status.name,
      statusColor: other.status.color,
      statusCategory: other.status.category as LinkedIssueDTO["other"]["statusCategory"],
      priorityName: other.priority?.name ?? null,
      priorityColor: other.priority?.color ?? null,
    },
    createdBy: toUserDTO(link.createdBy),
    createdAt: link.createdAt.toISOString(),
  };
}
