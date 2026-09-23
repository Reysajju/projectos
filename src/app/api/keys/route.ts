import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession, generateApiKey } from "@/lib/auth";
import { ApiError, canManage, clip, handle, parseBody, reqStr, unauthorized } from "@/lib/api-helpers";
import { logActivity } from "@/lib/workflow";
import type { ApiKeyDTO } from "@/lib/portal-types";

export const dynamic = "force-dynamic";

function parseScopes(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function toApiKeyDTO(k: {
  id: string;
  name: string;
  prefix: string;
  scopes: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  creator: { id: string; name: string; avatarColor: string };
}): ApiKeyDTO {
  return {
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    scopes: parseScopes(k.scopes) as ApiKeyDTO["scopes"],
    lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
    revoked: k.revokedAt != null,
    createdAt: k.createdAt.toISOString(),
    creator: { id: k.creator.id, name: k.creator.name, avatarColor: k.creator.avatarColor },
  };
}

/** GET /api/keys — list the org's API keys (ADMIN/MANAGER). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (!canManage(session.role)) throw new ApiError("Only ADMIN/MANAGER can view API keys", 403);
    const keys = await db.apiKey.findMany({
      where: { orgId: session.org.id },
      include: { creator: { select: { id: true, name: true, avatarColor: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ keys: keys.map(toApiKeyDTO) });
  });
}

/** POST /api/keys — mint a key; the raw token is returned exactly once. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (!canManage(session.role)) throw new ApiError("Only ADMIN/MANAGER can create API keys", 403);
    const body = await parseBody(req);

    const name = clip(reqStr(body, "name"), 60);
    if (!name) throw new ApiError("Name is required", 400);

    const requested = Array.isArray(body.scopes)
      ? body.scopes.filter((s): s is string => typeof s === "string")
      : ["read"];
    const scopes = requested.filter((s) => s === "read" || s === "write");
    if (scopes.length === 0) scopes.push("read");

    const { raw, prefix, keyHash } = generateApiKey();
    const key = await db.apiKey.create({
      data: {
        orgId: session.org.id,
        name,
        prefix,
        keyHash,
        scopes: JSON.stringify(scopes),
        createdById: session.user.id,
      },
      include: { creator: { select: { id: true, name: true, avatarColor: true } } },
    });

    await logActivity({
      orgId: session.org.id,
      userId: session.user.id,
      type: "apikey.created",
      newValue: `${name} (${prefix}…)`,
    });

    return NextResponse.json({ key: toApiKeyDTO(key), token: raw }, { status: 201 });
  });
}
