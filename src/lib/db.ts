import { Prisma, PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getDatabaseUrl(): string | undefined {
  if (process.env.VERCEL) {
    const rawUrl = process.env.DATABASE_URL || "file:../db/custom.db";
    // In Vercel serverless functions, the root filesystem is read-only.
    // If using a SQLite file, copy it to writable /tmp on cold boot.
    if (rawUrl.startsWith("file:")) {
      const tmpDb = "/tmp/custom.db";
      if (!fs.existsSync(tmpDb)) {
        const candidatePaths = [
          path.join(process.cwd(), "db", "custom.db"),
          path.join(process.cwd(), "..", "db", "custom.db"),
          "/var/task/db/custom.db",
        ];
        for (const candidate of candidatePaths) {
          if (fs.existsSync(candidate)) {
            try {
              fs.copyFileSync(candidate, tmpDb);
              break;
            } catch {
              // Ignore copy failure and fall through
            }
          }
        }
      }
      return `file:${tmpDb}`;
    }
  }
  return process.env.DATABASE_URL;
}

const dbUrl = getDatabaseUrl();

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: dbUrl ? { db: { url: dbUrl } } : undefined,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
