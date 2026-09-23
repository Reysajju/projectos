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
}

export interface IssueDetailPayload {
  issue: IssueDTO;
  comments: CommentDTO[];
  activity: ActivityDTO[];
  subtasks: IssueDTO[];
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
  dueDate?: string | null;
  estimateHours?: number | null;
  remainingHours?: number | null;
  labelIds?: string[];
  order?: number;
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
