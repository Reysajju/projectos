// ProjectOS — typed API client. Relative paths only (same-origin), JSON bodies.
// Throws Error(message from { error }) on non-OK responses.

import type {
  ActivityDTO,
  AuthPayload,
  BurndownPayload,
  CommentDTO,
  DashboardPayload,
  IssueCreateBody,
  IssueDTO,
  IssueDetailPayload,
  IssuePatchBody,
  MePayload,
  MemberWithRoleDTO,
  NotificationsPayload,
  OverviewPayload,
  ProjectCreateBody,
  ProjectDetailPayload,
  ProjectDTO,
  ProjectPatchBody,
  SearchPayload,
  SprintCreateBody,
  SprintDTO,
  SprintPatchBody,
  VelocityPayload,
  WorkspacePayload,
  AdvancedSearchPayload,
  FiltersPayload,
  SavedFilterDTO,
  AutomationsPayload,
  AutomationRuleDTO,
  CustomFieldsPayload,
  CustomFieldDTO,
  CustomFieldType,
  WorkflowPayload,
  WorkflowTransitionDTO,
  WorkflowStatusDTO,
  StatusCategory,
  AttachmentDTO,
  IssueLinkCreateBody,
  LinkedIssueDTO,
  WebhooksPayload,
  ApiKeysPayload,
  ApiKeyDTO,
  WebhookDTO,
  WebhookDeliveryDTO,
  WebhookTestResult,
  ReceiverPingsPayload,
  DigestKindDTO,
  DigestPreviewPayload,
  EmailDetailDTO,
  EmailsPayload,
} from "./portal-types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // no body / invalid JSON — fall through
  }

  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : `Request failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }

  return data as T;
}

function jsonBody(body: unknown, method: string): RequestInit {
  return { method, body: JSON.stringify(body) };
}

// ─── Auth ───────────────────────────────────────────────────────

export const api = {
  signup: (body: { email: string; name: string; orgName: string; orgSlug: string; password?: string }) =>
    apiFetch<AuthPayload>("/api/auth/signup", jsonBody(body, "POST")),

  login: (body: { email: string; password?: string; isDemo?: boolean }) =>
    apiFetch<AuthPayload>("/api/auth/login", jsonBody(body, "POST")),

  demoLogin: () =>
    apiFetch<AuthPayload>("/api/auth/login", jsonBody({ email: "sarah@acme.dev", isDemo: true }, "POST")),

  sendMagicLink: (body: { email: string; name?: string }) =>
    apiFetch<{ ok: boolean; email: string }>("/api/auth/magic", jsonBody(body, "POST")),

  verifyMagicLink: (body: { token: string }) =>
    apiFetch<AuthPayload>("/api/auth/magic/verify", jsonBody(body, "POST")),

  logout: () => apiFetch<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),

  claimInfo: (token: string) =>
    apiFetch<{ valid: boolean; name?: string; email?: string; expiresAt?: string }>(
      `/api/auth/claim?token=${encodeURIComponent(token)}`
    ),

  claimAccount: (body: { token: string; name?: string; password?: string }) =>
    apiFetch<AuthPayload>("/api/auth/claim", jsonBody(body, "POST")),

  forgotPassword: (body: { email: string }) =>
    apiFetch<{ ok: boolean }>("/api/auth/forgot-password", jsonBody(body, "POST")),

  resetPassword: (body: { token: string; password?: string }) =>
    apiFetch<AuthPayload>("/api/auth/reset-password", jsonBody(body, "POST")),

  me: () => apiFetch<MePayload>("/api/auth/me"),

  workspace: () => apiFetch<WorkspacePayload>("/api/workspace"),

  // ─── Projects ─────────────────────────────────────────────────

  createProject: (body: ProjectCreateBody) =>
    apiFetch<ProjectDTO>("/api/projects", jsonBody(body, "POST")),

  patchProject: (projectId: string, body: ProjectPatchBody) =>
    apiFetch<ProjectDTO>(`/api/projects/${projectId}`, jsonBody(body, "PATCH")),

  deleteProject: (projectId: string) =>
    apiFetch<{ ok: boolean }>(`/api/projects/${projectId}`, { method: "DELETE" }),

  getProject: (projectId: string) =>
    apiFetch<ProjectDetailPayload>(`/api/projects/${projectId}`),

  // ─── Issues ───────────────────────────────────────────────────

  createIssue: (body: IssueCreateBody) =>
    apiFetch<IssueDTO>("/api/issues", jsonBody(body, "POST")),

  getIssue: (issueId: string) => apiFetch<IssueDetailPayload>(`/api/issues/${issueId}`),

  patchIssue: (issueId: string, body: IssuePatchBody) =>
    apiFetch<IssueDTO>(`/api/issues/${issueId}`, jsonBody(body, "PATCH")),

  deleteIssue: (issueId: string) =>
    apiFetch<{ ok: boolean }>(`/api/issues/${issueId}`, { method: "DELETE" }),

  addComment: (issueId: string, body: { body: string }) =>
    apiFetch<CommentDTO>(`/api/issues/${issueId}/comments`, jsonBody(body, "POST")),

  deleteComment: (commentId: string) =>
    apiFetch<{ ok: boolean }>(`/api/comments/${commentId}`, { method: "DELETE" }),

  // ─── Issue links (blueprint §16) ───────────────────────────

  addIssueLink: (issueId: string, body: IssueLinkCreateBody) =>
    apiFetch<LinkedIssueDTO>(`/api/issues/${issueId}/links`, jsonBody(body, "POST")),

  deleteIssueLink: (linkId: string) =>
    apiFetch<{ ok: boolean }>(`/api/links/${linkId}`, { method: "DELETE" }),

  // ─── Attachments (multipart — no JSON content-type) ─────────

  uploadAttachment: async (
    issueId: string,
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<AttachmentDTO> => {
    // 3.5 MB chunks ensure we stay safely within Vercel's 4.5 MB request body limit
    const CHUNK_SIZE = 3.5 * 1024 * 1024;

    if (file.size <= CHUNK_SIZE) {
      const fd = new FormData();
      fd.append("file", file);
      onProgress?.(30);
      const res = await fetch(`/api/issues/${issueId}/attachments`, {
        method: "POST",
        body: fd,
        credentials: "same-origin",
      });
      let data: unknown = null;
      try {
        data = await res.json();
      } catch {
        // fall through
      }
      if (!res.ok) {
        const msg =
          data && typeof data === "object" && "error" in data
            ? String((data as { error: unknown }).error)
            : `Upload failed (${res.status})`;
        throw new ApiError(msg, res.status);
      }
      onProgress?.(100);
      return (data as { attachment: AttachmentDTO }).attachment;
    }

    // Chunked multi-part upload for large files up to GB scale
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    let lastData: unknown = null;

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);

      const fd = new FormData();
      fd.append("chunk", chunk, file.name);
      fd.append("uploadId", uploadId);
      fd.append("chunkIndex", String(i));
      fd.append("totalChunks", String(totalChunks));
      fd.append("fileName", file.name);
      fd.append("fileSize", String(file.size));
      fd.append("mimeType", file.type || "application/octet-stream");

      const res = await fetch(`/api/issues/${issueId}/attachments`, {
        method: "POST",
        body: fd,
        credentials: "same-origin",
      });

      try {
        lastData = await res.json();
      } catch {
        lastData = null;
      }

      if (!res.ok) {
        const msg =
          lastData && typeof lastData === "object" && "error" in lastData
            ? String((lastData as { error: unknown }).error)
            : `Upload failed on chunk ${i + 1}/${totalChunks} (${res.status})`;
        throw new ApiError(msg, res.status);
      }

      const percent = Math.round(((i + 1) / totalChunks) * 100);
      onProgress?.(percent);
    }

    return (lastData as { attachment: AttachmentDTO }).attachment;
  },

  attachmentUrl: (attachmentId: string, download = false) =>
    `/api/attachments/${attachmentId}${download ? "?download=1" : ""}`,

  deleteAttachment: (attachmentId: string) =>
    apiFetch<Record<string, never>>(`/api/attachments/${attachmentId}`, { method: "DELETE" }),

  // ─── Sprints ──────────────────────────────────────────────────

  createSprint: (body: SprintCreateBody) =>
    apiFetch<SprintDTO>("/api/sprints", jsonBody(body, "POST")),

  patchSprint: (sprintId: string, body: SprintPatchBody) =>
    apiFetch<SprintDTO>(`/api/sprints/${sprintId}`, jsonBody(body, "PATCH")),

  deleteSprint: (sprintId: string) =>
    apiFetch<{ ok: boolean }>(`/api/sprints/${sprintId}`, { method: "DELETE" }),

  // ─── Dashboard / notifications / search ───────────────────────

  dashboard: () => apiFetch<DashboardPayload>("/api/dashboard"),

  notifications: () => apiFetch<NotificationsPayload>("/api/notifications"),

  markNotificationsRead: (ids: string[]) =>
    apiFetch<{ ok: boolean }>("/api/notifications/read", jsonBody({ ids }, "POST")),

  search: (q: string) => apiFetch<SearchPayload>(`/api/search?q=${encodeURIComponent(q)}`),

  // ─── Per-user preferences (dashboard widgets etc.) ───────────

  getPreferences: () => apiFetch<Record<string, unknown>>("/api/preferences"),

  setPreference: (key: string, value: unknown) =>
    apiFetch<{ ok: boolean }>("/api/preferences", jsonBody({ key, value }, "PATCH")),

  // ─── Reports ──────────────────────────────────────────────────

  burndown: (sprintId: string) =>
    apiFetch<BurndownPayload>(`/api/reports/burndown?sprintId=${encodeURIComponent(sprintId)}`),

  velocity: (projectId: string) =>
    apiFetch<VelocityPayload>(`/api/reports/velocity?projectId=${encodeURIComponent(projectId)}`),

  overview: (projectId: string) =>
    apiFetch<OverviewPayload>(`/api/reports/overview?projectId=${encodeURIComponent(projectId)}`),

  // ─── Team ─────────────────────────────────────────────────────

  inviteMember: (body: { email: string; name?: string; role?: string; title?: string }) =>
    apiFetch<MemberWithRoleDTO & { emailStatus?: string | null; claimToken?: string | null }>(
      "/api/members",
      jsonBody(body, "POST")
    ),

  patchMember: (userId: string, body: { role: string }) =>
    apiFetch<MemberWithRoleDTO>(`/api/members/${userId}`, jsonBody(body, "PATCH")),

  resendInvite: (userId: string) =>
    apiFetch<{ ok: boolean; status: string; claimToken?: string; message: string }>(
      "/api/members/resend-invite",
      jsonBody({ userId }, "POST")
    ),

  emailStatus: () =>
    apiFetch<{
      configured: boolean;
      host: string | null;
      port: number | null;
      secure: boolean;
      user: string | null;
      from: string;
      appUrl: string;
      suggestion: string | null;
    }>("/api/email/test"),

  sendTestEmail: () =>
    apiFetch<{ status: string; message: string; verificationError?: string }>(
      "/api/email/test",
      { method: "POST" }
    ),

  // ─── Custom fields ────────────────────────────────────────

  customFields: () => apiFetch<CustomFieldsPayload>("/api/custom-fields"),

  createCustomField: (body: { name: string; type: CustomFieldType; options?: string[] }) =>
    apiFetch<{ field: CustomFieldDTO }>("/api/custom-fields", jsonBody(body, "POST")),

  patchCustomField: (id: string, body: { name?: string; order?: number; options?: string[] }) =>
    apiFetch<{ field: CustomFieldDTO }>(`/api/custom-fields/${id}`, jsonBody(body, "PATCH")),

  deleteCustomField: (id: string) =>
    apiFetch<Record<string, never>>(`/api/custom-fields/${id}`, { method: "DELETE" }),
};

export type { ActivityDTO };

// ─── Advanced search / saved filters / automations ──────────────

export const api2 = {
  advancedSearch: (query: string) =>
    apiFetch<AdvancedSearchPayload>("/api/search/advanced", jsonBody({ query }, "POST")),

  filters: () => apiFetch<FiltersPayload>("/api/filters"),
  createFilter: (body: { name: string; query: string }) =>
    apiFetch<{ filter: SavedFilterDTO }>("/api/filters", jsonBody(body, "POST")),
  deleteFilter: (id: string) =>
    apiFetch<Record<string, never>>(`/api/filters/${id}`, { method: "DELETE" }),

  automations: () => apiFetch<AutomationsPayload>("/api/automations"),
  createAutomation: (body: {
    name: string;
    trigger: string;
    conditions: { field: string; operator: string; value: string }[];
    actions: { type: string; value?: string }[];
  }) => apiFetch<{ rule: AutomationRuleDTO }>("/api/automations", jsonBody(body, "POST")),
  patchAutomation: (
    id: string,
    body: Partial<{
      name: string;
      trigger: string;
      enabled: boolean;
      conditions: { field: string; operator: string; value: string }[];
      actions: { type: string; value?: string }[];
    }>
  ) => apiFetch<{ rule: AutomationRuleDTO }>(`/api/automations/${id}`, jsonBody(body, "PATCH")),
  deleteAutomation: (id: string) =>
    apiFetch<Record<string, never>>(`/api/automations/${id}`, { method: "DELETE" }),

  testAutomation: (body: {
    conditions: { field: string; operator: string; value: string }[];
    actions: { type: string; value?: string }[];
    projectId?: string | null;
  }) =>
    apiFetch<{
      scanned: number;
      matchCount: number;
      truncated: boolean;
      matches: {
        id: string; key: string; summary: string;
        status: { name: string; color: string };
        type: { name: string };
        assignee: { id: string; name: string } | null;
        wouldApply: string[];
      }[];
    }>("/api/automations/test", jsonBody(body, "POST")),
};

// ─── Workflow designer / statuses ───────────────────────────────

export const api3 = {
  workflow: () => apiFetch<WorkflowPayload>("/api/workflow"),

  createTransition: (body: { fromStatusId: string; toStatusId: string }) =>
    apiFetch<{ transition: WorkflowTransitionDTO }>("/api/workflow/transitions", jsonBody(body, "POST")),

  deleteTransition: (id: string) =>
    apiFetch<Record<string, never>>(`/api/workflow/transitions/${id}`, { method: "DELETE" }),

  createStatus: (body: { name: string; category: StatusCategory; color?: string }) =>
    apiFetch<{ status: WorkflowStatusDTO }>("/api/statuses", jsonBody(body, "POST")),

  patchStatus: (
    id: string,
    body: { name?: string; category?: StatusCategory; color?: string; isInitial?: boolean }
  ) => apiFetch<{ status: WorkflowStatusDTO }>(`/api/statuses/${id}`, jsonBody(body, "PATCH")),

  deleteStatus: (id: string, moveTo?: string) =>
    apiFetch<{ movedTo: string }>(
      `/api/statuses/${id}${moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : ""}`,
      { method: "DELETE" }
    ),
};

// ─── Webhooks engine ───────────────────────────────────────────

export const apiWebhooks = {
  list: () => apiFetch<WebhooksPayload>("/api/webhooks"),

  create: (body: { url: string; events: string[]; description?: string }) =>
    apiFetch<{ webhook: WebhookDTO; secret: string }>("/api/webhooks", jsonBody(body, "POST")),

  patch: (
    id: string,
    body: Partial<{ url: string; events: string[]; description: string | null; active: boolean }>
  ) => apiFetch<{ webhook: WebhookDTO }>(`/api/webhooks/${id}`, jsonBody(body, "PATCH")),

  remove: (id: string) =>
    apiFetch<Record<string, never>>(`/api/webhooks/${id}`, { method: "DELETE" }),

  deliveries: (id: string) =>
    apiFetch<{ deliveries: WebhookDeliveryDTO[] }>(`/api/webhooks/${id}/deliveries`),

  sendTest: (id: string) =>
    apiFetch<WebhookTestResult>(`/api/webhooks/${id}/test`, { method: "POST" }),

  receiverPings: () => apiFetch<ReceiverPingsPayload>("/api/webhook-receiver"),
};

// ─── API keys (blueprint §38 second half) ──────────────────────

export const apiKeys = {
  list: () => apiFetch<ApiKeysPayload>("/api/keys"),

  create: (body: { name: string; scopes: string[] }) =>
    apiFetch<{ key: ApiKeyDTO; token: string }>("/api/keys", jsonBody(body, "POST")),

  revoke: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/keys/${id}`, { method: "DELETE" }),
};

// ─── Email digest (blueprint §34) ──────────────────────────────

export const apiDigest = {
  preview: (kind: DigestKindDTO) =>
    apiFetch<DigestPreviewPayload>(`/api/digest?kind=${kind}`),

  send: (body: { kind: DigestKindDTO; userIds?: string[]; all?: boolean }) =>
    apiFetch<{ sent: number; kind: string }>("/api/digest", jsonBody(body, "POST")),

  log: () => apiFetch<EmailsPayload>("/api/emails"),

  getEmail: (id: string) =>
    apiFetch<EmailDetailDTO>(`/api/emails/${id}`),

  /** Prune outbox rows older than the retention window (ADMIN/MANAGER). */
  prune: () => apiFetch<{ deleted: number; retentionDays: number }>("/api/emails", { method: "DELETE" }),
};
