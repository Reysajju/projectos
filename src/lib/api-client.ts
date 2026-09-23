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
  signup: (body: { email: string; name: string; password: string; orgName: string; orgSlug: string }) =>
    apiFetch<AuthPayload>("/api/auth/signup", jsonBody(body, "POST")),

  login: (body: { email: string; password: string }) =>
    apiFetch<AuthPayload>("/api/auth/login", jsonBody(body, "POST")),

  logout: () => apiFetch<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),

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

  // ─── Reports ──────────────────────────────────────────────────

  burndown: (sprintId: string) =>
    apiFetch<BurndownPayload>(`/api/reports/burndown?sprintId=${encodeURIComponent(sprintId)}`),

  velocity: (projectId: string) =>
    apiFetch<VelocityPayload>(`/api/reports/velocity?projectId=${encodeURIComponent(projectId)}`),

  overview: (projectId: string) =>
    apiFetch<OverviewPayload>(`/api/reports/overview?projectId=${encodeURIComponent(projectId)}`),

  // ─── Team ─────────────────────────────────────────────────────

  inviteMember: (body: { email: string; name?: string; role?: string; title?: string }) =>
    apiFetch<MemberWithRoleDTO>("/api/members", jsonBody(body, "POST")),

  patchMember: (userId: string, body: { role: string }) =>
    apiFetch<MemberWithRoleDTO>(`/api/members/${userId}`, jsonBody(body, "PATCH")),

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
};
