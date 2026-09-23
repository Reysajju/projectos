// ProjectOS — frontend DTO types mirroring the API contract (worklog.md).
// All dates are ISO strings as serialized by the API.

export type Role = "ADMIN" | "MANAGER" | "MEMBER" | "VIEWER";

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  title: string | null;
}

export type MemberDTO = UserDTO & { role: string };

export interface OrgDTO {
  id: string;
  name: string;
  slug: string;
}

export interface ProjectDTO {
  id: string;
  key: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  lead: UserDTO | null;
  archived: boolean;
  issueCount: number;
  /** Board column WIP limits: { statusId: maxCount } */
  wipLimits: Record<string, number>;
}

export interface TypeDTO {
  id: string;
  name: string;
  color: string;
  icon: string;
  order: number;
}

export type StatusCategory = "TODO" | "IN_PROGRESS" | "DONE";

export interface StatusDTO {
  id: string;
  name: string;
  category: StatusCategory;
  color: string;
  order: number;
}

export interface PriorityDTO {
  id: string;
  name: string;
  color: string;
  order: number;
}

export interface LabelDTO {
  id: string;
  name: string;
  color: string;
}

export type CustomFieldType = "TEXT" | "NUMBER" | "DATE" | "SELECT" | "CHECKBOX";

export interface CustomFieldDTO {
  id: string;
  name: string;
  type: CustomFieldType;
  options: string[];
  order: number;
}

export type SprintStatus = "FUTURE" | "ACTIVE" | "COMPLETED";

export interface SprintDTO {
  id: string;
  projectId: string;
  name: string;
  goal: string | null;
  startDate: string | null;
  endDate: string | null;
  status: SprintStatus;
  order: number;
}

export interface CommentDTO {
  id: string;
  body: string;
  createdAt: string;
  author: UserDTO;
}

export interface ActivityDTO {
  id: string;
  type: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  user: UserDTO;
  issueId: string | null;
}

export interface NotificationDTO {
  id: string;
  type: string;
  title: string;
  body: string | null;
  issueId: string | null;
  read: boolean;
  createdAt: string;
}

export interface IssueDTO {
  id: string;
  key: string;
  number: number;
  summary: string;
  description: string | null;
  typeId: string;
  type: TypeDTO;
  statusId: string;
  status: StatusDTO;
  priorityId: string | null;
  priority: PriorityDTO | null;
  assigneeId: string | null;
  assignee: UserDTO | null;
  reporterId: string | null;
  reporter: UserDTO | null;
  labels: LabelDTO[];
  storyPoints: number | null;
  startDate: string | null;
  dueDate: string | null;
  estimateHours: number | null;
  remainingHours: number | null;
  sprintId: string | null;
  parentId: string | null;
  order: number;
  projectId: string;
  projectKey: string;
  projectName: string;
  createdAt: string;
  updatedAt: string;
  commentCount: number;
  subtaskCount: number;
  subtasksDone: number;
  attachmentCount: number;
  linkCount: number;
  /** Custom field values keyed by fieldId (values are strings). */
  customFields: Record<string, string>;
}

// ─── Issue links (blueprint §16) ────────────────────────────

export type IssueLinkType = "BLOCKS" | "DUPLICATES" | "RELATES" | "CAUSES";

/** One end of a link as seen from the issue being viewed. */
export interface LinkedIssueDTO {
  linkId: string;
  type: IssueLinkType;
  /** outward: this issue <verb> other; inward: this issue is <verb-passive> by other */
  direction: "outward" | "inward";
  other: {
    id: string;
    key: string;
    summary: string;
    typeName: string;
    typeIcon: string;
    typeColor: string;
    statusName: string;
    statusColor: string;
    statusCategory: "TODO" | "IN_PROGRESS" | "DONE";
    priorityName: string | null;
    priorityColor: string | null;
  };
  createdBy: { id: string; name: string; avatarColor: string };
  createdAt: string;
}

export interface MemberWithRoleDTO extends UserDTO {
  role: string;
}

export interface WorkspacePayload {
  user: UserDTO;
  org: OrgDTO;
  role: string;
  members: MemberWithRoleDTO[];
  projects: ProjectDTO[];
  issueTypes: TypeDTO[];
  statuses: StatusDTO[];
  priorities: PriorityDTO[];
  labels: LabelDTO[];
  customFields: CustomFieldDTO[];
}

export interface MePayload {
  user: UserDTO;
  org: OrgDTO;
  role: string;
}

export interface AuthPayload {
  user: UserDTO;
  org: OrgDTO;
}

export interface ProjectStatsDTO {
  total: number;
  todo: number;
  inProgress: number;
  done: number;
  points: number;
  donePoints: number;
  overdue: number;
}

export interface ProjectDetailPayload {
  project: ProjectDTO;
  issues: IssueDTO[];
  sprints: SprintDTO[];
  activity: ActivityDTO[];
  stats: ProjectStatsDTO;
  /** Link edges whose BOTH endpoints are issues of this project (for roadmap arrows). */
  links: IssueEdgeDTO[];
}

/** Lightweight link edge — both endpoints are issues in the same project. */
export interface IssueEdgeDTO {
  id: string;
  sourceId: string;
  targetId: string;
  type: IssueLinkType;
}

export interface IssueDetailPayload {
  issue: IssueDTO;
  comments: CommentDTO[];
  activity: ActivityDTO[];
  subtasks: IssueDTO[];
  attachments: AttachmentDTO[];
  links: LinkedIssueDTO[];
}

export interface IssueLinkCreateBody {
  type: IssueLinkType;
  /** Issue key of the other end, e.g. WEB-9. */
  targetKey: string;
}

export interface DashboardStatsDTO {
  myOpen: number;
  totalIssues: number;
  openIssues: number;
  completedThisWeek: number;
  activeSprints: number;
}

export interface ActiveSprintCardDTO {
  sprint: SprintDTO;
  projectName: string;
  projectKey: string;
  total: number;
  done: number;
  points: number;
  donePoints: number;
}

export interface CreatedVsResolvedPoint {
  date: string;
  created: number;
  resolved: number;
}

export interface DashboardPayload {
  stats: DashboardStatsDTO;
  myIssues: IssueDTO[];
  upcomingDue: IssueDTO[];
  activity: ActivityDTO[];
  createdVsResolved: CreatedVsResolvedPoint[];
  activeSprintCards: ActiveSprintCardDTO[];
}

export interface NotificationsPayload {
  notifications: NotificationDTO[];
  unread: number;
}

export interface SearchPayload {
  issues: IssueDTO[];
  projects: ProjectDTO[];
}

export interface BurndownPoint {
  date: string;
  remaining: number;
  ideal: number;
}

export interface BurndownPayload {
  total: number;
  completed: number;
  points: BurndownPoint[];
}

export interface VelocitySprintDTO {
  id: string;
  name: string;
  committed: number;
  completed: number;
}

export interface VelocityPayload {
  sprints: VelocitySprintDTO[];
}

export interface NameCountDTO {
  name: string;
  color: string;
  count: number;
}

export interface AssigneeLoadDTO {
  userId: string;
  name: string;
  avatarColor: string;
  open: number;
  done: number;
}

export interface OverviewPayload {
  statusDist: NameCountDTO[];
  priorityDist: NameCountDTO[];
  assigneeLoad: AssigneeLoadDTO[];
  typeDist: NameCountDTO[];
}

// ─── Request bodies ─────────────────────────────────────────────

export interface IssuePatchBody {
  summary?: string;
  description?: string | null;
  typeId?: string;
  statusId?: string;
  priorityId?: string | null;
  assigneeId?: string | null;
  sprintId?: string | null;
  storyPoints?: number | null;
  startDate?: string | null;
  dueDate?: string | null;
  estimateHours?: number | null;
  remainingHours?: number | null;
  labelIds?: string[];
  order?: number;
  /** Replace the whole custom-field values map (null clears a field). */
  customFields?: Record<string, string | null>;
}

export interface IssueCreateBody {
  projectId: string;
  typeId: string;
  summary: string;
  description?: string;
  priorityId?: string | null;
  assigneeId?: string | null;
  sprintId?: string | null;
  storyPoints?: number | null;
  dueDate?: string | null;
  parentId?: string | null;
  labelIds?: string[];
}

export interface ProjectCreateBody {
  name: string;
  key: string;
  description?: string;
  color?: string;
  icon?: string;
  leadId?: string | null;
}

export interface ProjectPatchBody {
  name?: string;
  description?: string | null;
  color?: string;
  icon?: string;
  leadId?: string | null;
  archived?: boolean;
  /** Replace the whole board WIP limits map. */
  wipLimits?: Record<string, number>;
}

export interface SprintCreateBody {
  projectId: string;
  name: string;
  goal?: string;
  startDate?: string | null;
  endDate?: string | null;
}

export interface SprintPatchBody {
  name?: string;
  goal?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: SprintStatus;
}

// ─── Advanced search (JQL-lite) ─────────────────────────────────

export interface AdvancedSearchPayload {
  issues: IssueDTO[];
  parsed: string;
  error: string | null;
}

// ─── Saved filters ──────────────────────────────────────────────

export interface SavedFilterDTO {
  id: string;
  name: string;
  query: string;
  createdAt: string;
  owner: { id: string; name: string; avatarColor: string };
}

export interface FiltersPayload {
  filters: SavedFilterDTO[];
}

// ─── Automation rules ───────────────────────────────────────────

export type AutomationTrigger =
  | "issue.created"
  | "issue.status_changed"
  | "issue.assigned"
  | "comment.created";

export interface AutomationConditionDTO {
  field: string;
  operator: "equals" | "notEquals" | "contains";
  value: string;
}

export interface AutomationActionDTO {
  type: string;
  value?: string;
}

export interface AutomationRuleDTO {
  id: string;
  name: string;
  trigger: AutomationTrigger;
  conditions: AutomationConditionDTO[];
  actions: AutomationActionDTO[];
  enabled: boolean;
  runCount: number;
  lastRunAt: string | null;
  lastRunResult: string | null;
  creator: { id: string; name: string; avatarColor: string };
  createdAt: string;
}

export interface AutomationsPayload {
  rules: AutomationRuleDTO[];
}

// ─── Custom fields ───────────────────────────────────────────

export interface CustomFieldsPayload {
  fields: CustomFieldDTO[];
}

export interface CustomFieldCreateBody {
  name: string;
  type: CustomFieldType;
  options?: string[];
}

export interface CustomFieldPatchBody {
  name?: string;
  order?: number;
  options?: string[];
}

// ─── Workflow designer ──────────────────────────────────────

export interface WorkflowStatusDTO {
  id: string;
  name: string;
  category: StatusCategory;
  color: string;
  order: number;
  isInitial: boolean;
  issueCount: number;
}

export interface WorkflowTransitionDTO {
  id: string;
  fromStatusId: string;
  toStatusId: string;
}

export interface WorkflowPayload {
  statuses: WorkflowStatusDTO[];
  transitions: WorkflowTransitionDTO[];
  restricted: boolean;
}

// ─── Attachments (blueprint §15) ────────────────────────────

export interface AttachmentDTO {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  /** First 12 hex chars of the sha256 content checksum. */
  checksum: string;
  isImage: boolean;
  createdAt: string;
  uploader: UserDTO;
}

// ─── Webhooks (blueprint §38) ───────────────────────────────

export interface WebhookDeliveryDTO {
  id: string;
  event: string;
  status: "SUCCESS" | "FAILED";
  responseCode: number | null;
  durationMs: number | null;
  error: string | null;
  createdAt: string;
}

export interface WebhookDTO {
  id: string;
  url: string;
  events: string[];
  description: string | null;
  active: boolean;
  createdAt: string;
  creator: UserDTO;
  stats: { total: number; succeeded: number };
  deliveries: WebhookDeliveryDTO[];
}

export interface WebhooksPayload {
  webhooks: WebhookDTO[];
}

// ─── API keys (blueprint §38 second half) ───────────────────

export interface ApiKeyDTO {
  id: string;
  name: string;
  /** First characters of the raw token, for identification only. */
  prefix: string;
  scopes: ("read" | "write")[];
  lastUsedAt: string | null;
  revoked: boolean;
  createdAt: string;
  creator: { id: string; name: string; avatarColor: string };
}

export interface ApiKeysPayload {
  keys: ApiKeyDTO[];
}

export interface WebhookTestResult {
  status: "SUCCESS" | "FAILED";
  responseCode: number | null;
  durationMs: number;
  error: string | null;
}

export interface ReceiverPing {
  id: string;
  at: string;
  event: string | null;
  verified: boolean;
  signatureHeader: string | null;
  body: unknown;
}

export interface ReceiverPingsPayload {
  pings: ReceiverPing[];
}

// ─── Email digest (blueprint §34) ───────────────────────────

export type DigestKind = "DAILY" | "WEEKLY";

export interface DigestItemDTO {
  key: string;
  summary: string;
  projectName: string;
  statusName: string;
  statusColor: string;
  priorityName: string | null;
  dueDate: string | null;
}

export interface DigestSectionDTO {
  id: "assigned" | "due-soon" | "overdue" | "blocked" | "completed";
  title: string;
  items: DigestItemDTO[];
}

export interface DigestPreviewPayload {
  recipient: { name: string; email: string };
  kind: DigestKind;
  periodLabel: string;
  subject: string;
  sections: DigestSectionDTO[];
  counts: {
    assignedOpen: number;
    dueSoon: number;
    overdue: number;
    blocked: number;
    completed: number;
    openTotal: number;
  };
  text: string;
}

export interface EmailLogDTO {
  id: string;
  kind: string;
  toEmail: string;
  toName: string | null;
  subject: string;
  status: string;
  trigger: string | null;
  createdAt: string;
}

export interface EmailsPayload {
  emails: EmailLogDTO[];
  total: number;
  retentionDays: number;
}

export type DigestKindDTO = DigestKind;
