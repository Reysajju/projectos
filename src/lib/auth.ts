import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import type { User, Organization } from "@prisma/client";

export const SESSION_COOKIE = "pos_session";
const SESSION_DAYS = 30;

// ─── API keys (blueprint §38) ───────────────────────────────────

export const API_KEY_PREFIX = "posk_";

/** sha256 hex of a raw API token — the only thing we store. */
export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Generate a fresh API token + its display prefix + storage hash. */
export function generateApiKey(): { raw: string; prefix: string; keyHash: string } {
  const raw = `${API_KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  return { raw, prefix: raw.slice(0, 14), keyHash: hashApiKey(raw) };
}

// ─── Password hashing (scrypt, no native deps) ──────────────────

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(":");
    const hashBuf = Buffer.from(hash, "hex");
    const testBuf = scryptSync(password, salt, 64);
    return timingSafeEqual(hashBuf, testBuf);
  } catch {
    return false;
  }
}

// ─── Sessions ───────────────────────────────────────────────────

function getSessionSecret(): string {
  return process.env.CRON_SECRET || process.env.DIGEST_CRON_SECRET || "projectos_internal_session_secret_2026";
}

function signSessionToken(userId: string, expiresAt: Date): string {
  const exp = expiresAt.getTime();
  const rand = randomBytes(16).toString("hex");
  const data = `${userId}.${exp}.${rand}`;
  const sig = createHmac("sha256", getSessionSecret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function verifySignedSessionToken(token: string): { userId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [userId, expStr, rand, sig] = parts;
  const exp = Number(expStr);
  if (!exp || Number.isNaN(exp) || exp < Date.now()) return null;
  const data = `${userId}.${expStr}.${rand}`;
  const expectedSig = createHmac("sha256", getSessionSecret()).update(data).digest("base64url");
  if (sig !== expectedSig) return null;
  return { userId };
}

export async function createSession(userId: string): Promise<string> {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const token = signSessionToken(userId, expiresAt);
  try {
    await db.session.create({ data: { token, userId, expiresAt } });
  } catch (err) {
    console.warn("[session] Could not persist session in db (using stateless token):", err);
  }
  return token;
}

export async function destroySession(token: string) {
  try {
    await db.session.deleteMany({ where: { token } });
  } catch {
    // Ignore db failure on logout
  }
}

export function sessionCookieOptions(req?: Request) {
  let isHttps = false;
  if (req) {
    const proto = req.headers.get("x-forwarded-proto");
    const host = req.headers.get("host") || "";
    isHttps =
      proto === "https" ||
      req.url.startsWith("https:") ||
      (!host.includes("localhost") && !host.includes("127.0.0.1") && process.env.NODE_ENV === "production");
  } else if (process.env.COOKIE_SECURE === "true") {
    isHttps = true;
  }
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isHttps && process.env.COOKIE_SECURE !== "false",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}

export type SessionInfo = {
  user: User;
  org: Organization;
  role: string;
  membershipId: string;
};

function parseScopes(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export async function getSession(req: Request): Promise<SessionInfo | null> {
  // ── 1. API-key bearer tokens (blueprint §38): Authorization: Bearer posk_…
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const raw = authHeader.slice(7).trim();
    if (raw.startsWith(API_KEY_PREFIX)) {
      const apiKey = await db.apiKey.findUnique({
        where: { keyHash: hashApiKey(raw) },
        include: { org: true, creator: true },
      });
      if (!apiKey || apiKey.revokedAt) return null;
      // Throttled last-used stamp: at most one write per key per minute.
      const now = Date.now();
      if (!apiKey.lastUsedAt || now - apiKey.lastUsedAt.getTime() > 60_000) {
        void db.apiKey
          .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
          .catch(() => undefined);
      }
      const scopes = parseScopes(apiKey.scopes);
      const role = scopes.includes("write") ? "MEMBER" : "VIEWER";
      return { user: apiKey.creator, org: apiKey.org, role, membershipId: `apikey:${apiKey.id}` };
    }
  }

  // ── 2. Browser session cookie.
  // Works with both NextRequest (cookies.get) and plain Request (header parse)
  let token: string | undefined;
  const cookieHeader = req.headers.get("cookie") ?? "";
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (match) token = decodeURIComponent(match.slice(SESSION_COOKIE.length + 1));
  if (!token) return null;

  let user: User | null = null;
  try {
    const session = await db.session.findUnique({
      where: { token },
      include: { user: true },
    });
    if (session && session.expiresAt >= new Date()) {
      user = session.user;
    }
  } catch {
    // DB session lookup error fallback
  }

  if (!user) {
    const verified = verifySignedSessionToken(token);
    if (!verified) return null;
    user = await db.user.findUnique({
      where: { id: verified.userId },
    });
  }

  if (!user) return null;

  const membership = await db.organizationMember.findFirst({
    where: { userId: user.id },
    include: { org: true },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return null;

  return {
    user,
    org: membership.org,
    role: membership.role,
    membershipId: membership.id,
  };
}

// ─── Org-scoped defaults (used by signup + seed) ────────────────

export const DEFAULT_ISSUE_TYPES = [
  { name: "Epic", color: "#7c3aed", icon: "layers", order: 0 },
  { name: "Story", color: "#059669", icon: "book-open", order: 1 },
  { name: "Task", color: "#d97706", icon: "check-circle-2", order: 2 },
  { name: "Bug", color: "#e11d48", icon: "bug", order: 3 },
  { name: "Sub-task", color: "#78716c", icon: "git-branch", order: 4 },
];

export const DEFAULT_STATUSES = [
  { name: "Backlog", category: "TODO", color: "#78716c", order: 0, isInitial: true },
  { name: "To Do", category: "TODO", color: "#a8a29e", order: 1, isInitial: false },
  { name: "In Progress", category: "IN_PROGRESS", color: "#d97706", order: 2, isInitial: false },
  { name: "In Review", category: "IN_PROGRESS", color: "#7c3aed", order: 3, isInitial: false },
  { name: "Done", category: "DONE", color: "#059669", order: 4, isInitial: false },
];

export const DEFAULT_PRIORITIES = [
  { name: "Lowest", order: 0, color: "#a8a29e" },
  { name: "Low", order: 1, color: "#10b981" },
  { name: "Medium", order: 2, color: "#d97706" },
  { name: "High", order: 3, color: "#ea580c" },
  { name: "Highest", order: 4, color: "#e11d48" },
];

export const DEFAULT_LABELS = [
  { name: "frontend", color: "#d97706" },
  { name: "backend", color: "#059669" },
  { name: "design", color: "#7c3aed" },
  { name: "performance", color: "#ea580c" },
  { name: "security", color: "#e11d48" },
  { name: "ux", color: "#0d9488" },
];

export async function seedOrgDefaults(orgId: string) {
  await db.issueType.createMany({ data: DEFAULT_ISSUE_TYPES.map((t) => ({ ...t, orgId })) });
  await db.status.createMany({ data: DEFAULT_STATUSES.map((s) => ({ ...s, orgId })) });
  await db.priority.createMany({ data: DEFAULT_PRIORITIES.map((p) => ({ ...p, orgId })) });
  await db.label.createMany({ data: DEFAULT_LABELS.map((l) => ({ ...l, orgId })) });
}
