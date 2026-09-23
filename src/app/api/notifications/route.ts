import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { toNotificationDTO } from "@/lib/dto";
import { handle, unauthorized } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await getSession(req);
    if (!session) return unauthorized();
    const where = { orgId: session.org.id, userId: session.user.id };

    const [notifications, unread] = await Promise.all([
      db.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 }),
      db.notification.count({ where: { ...where, read: false } }),
    ]);

    return NextResponse.json({
      notifications: notifications.map(toNotificationDTO),
      unread,
    });
  });
}
