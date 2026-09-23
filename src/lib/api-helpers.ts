import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { WorkflowError, notify } from "@/lib/workflow";

// ─── Errors ─────────────────────────────────────────────────────

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export const jsonError = (error: string, status: number) => NextResponse.json({ error }, { status });
export const unauthorized = () => jsonError("Unauthorized", 401);
export const forbidden = (message = "Forbidden") => jsonError(message, 403);
export const badRequest = (message = "Bad request") => jsonError(message, 400);
export const notFound = (message = "Not found") => jsonError(message, 404);

/**
 * Wrap a route handler body: maps thrown WorkflowError / ApiError to their
 * status codes, unique-constraint violations to 409, everything else to 500.
 */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof WorkflowError) return jsonError(err.message, err.status);
    if (err instanceof ApiError) return jsonError(err.message, err.status);
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return jsonError("A record with these values already exists", 409);
    }
    console.error("[api] Unhandled error:", err);
    return jsonError("Internal server error", 500);
  }
}

// ─── Body parsing helpers ───────────────────────────────────────

export async function parseBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const json: unknown = await req.json();
    if (json && typeof json === "object" && !Array.isArray(json)) return json as Record<string, unknown>;
    return {};
  } catch {
    return {};
  }
}

/** Required non-empty string. Throws 400 when missing. */
export function reqStr(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  if (typeof v !== "string" || !v.trim()) throw new ApiError(`${key} is required`, 400);
  return v.trim();
}

export function optStr(body: Record<string, unknown>, key: string): string | undefined {
  const v = body[key];
  return typeof v === "string" ? v : undefined;
}

export function optStrOrNull(body: Record<string, unknown>, key: string): string | null | undefined {
  const v = body[key];
  if (v === null) return null;
  return typeof v === "string" ? v : undefined;
}

/**
 * Entity-id field semantics: undefined = field absent, null/"" = clear the
 * field, string = set it. Anything else throws 400.
 */
export function idOrNull(body: Record<string, unknown>, key: string): string | null | undefined {
  const v = body[key];
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v === "string") return v;
  throw new ApiError(`Invalid value for ${key}`, 400);
}

export function optNumOrNull(body: Record<string, unknown>, key: string): number | null | undefined {
  const v = body[key];
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  throw new ApiError(`Invalid number for ${key}`, 400);
}

export function optBool(body: Record<string, unknown>, key: string): boolean | undefined {
  const v = body[key];
  return typeof v === "boolean" ? v : undefined;
}

export function optStrArr(body: Record<string, unknown>, key: string): string[] | undefined {
  const v = body[key];
  if (v === undefined) return undefined;
  if (v === null) return [];
  if (Array.isArray(v) && v.every((x) => typeof x === "string")) return v as string[];
  throw new ApiError(`Invalid value for ${key}`, 400);
}

export function optDateOrNull(body: Record<string, unknown>, key: string): Date | null | undefined {
  const v = body[key];
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v !== "string") throw new ApiError(`Invalid date for ${key}`, 400);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new ApiError(`Invalid date for ${key}`, 400);
  return d;
}

/** Long values (summaries/descriptions) are clipped before going into activity rows. */
export function clip(value: string | null | undefined, max = 200): string | null {
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

// ─── Roles ──────────────────────────────────────────────────────

const WRITE_ROLES = ["ADMIN", "MANAGER", "MEMBER"];
export const ROLES = ["ADMIN", "MANAGER", "MEMBER", "VIEWER"] as const;

/** VIEWER is read-only across the portal. */
export function canWrite(role: string): boolean {
  return WRITE_ROLES.includes(role);
}

// ─── Notification fan-out ───────────────────────────────────────

/** Notify every member of the org except the actor. */
export async function notifyOrgMembers(opts: {
  orgId: string;
  actorId: string;
  type: string;
  title: string;
  body?: string | null;
  issueId?: string | null;
}) {
  const members = await db.organizationMember.findMany({
    where: { orgId: opts.orgId },
    select: { userId: true },
  });
  for (const m of members) {
    if (m.userId === opts.actorId) continue;
    await notify({
      orgId: opts.orgId,
      userId: m.userId,
      type: opts.type,
      title: opts.title,
      body: opts.body ?? null,
      issueId: opts.issueId ?? null,
    });
  }
}
