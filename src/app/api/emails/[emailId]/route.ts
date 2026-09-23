import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManage, handle, notFound, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/emails/:id — full content of one outbox row (ADMIN/MANAGER).
 * Returns the rendered HTML + plain text exactly as it would be delivered.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ emailId: string }> }
) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    if (!canManage(session.role)) {
      return NextResponse.json({ error: "Only admins and managers can view the outbox" }, { status: 403 });
    }
    const { emailId } = await params;

    const log = await db.emailLog.findFirst({
      where: { id: emailId, orgId: session.org.id },
      include: { user: { select: { name: true } } },
    });
    if (!log) return notFound("Email not found");

    return NextResponse.json({
      id: log.id,
      kind: log.kind,
      toEmail: log.toEmail,
      toName: log.user?.name ?? null,
      subject: log.subject,
      status: log.status,
      error: log.error,
      html: log.html,
      text: log.body,
      createdAt: log.createdAt.toISOString(),
    });
  });
}
