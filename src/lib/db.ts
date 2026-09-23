// Import the generated client directly (not the @prisma/client barrel) so that
// after `prisma db:push` regenerates the client, the dev server picks up new
// model delegates even if its module cache holds a stale @prisma/client copy.
import { Prisma, PrismaClient } from '.prisma/client/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaSignature: string | undefined
}

// Content signature of the generated client's model set. Keying the global
// cache on this signature busts it automatically after client regeneration.
const signature = Object.values(Prisma.ModelName ?? {}).sort().join(',')

export const db =
  globalForPrisma.prisma && globalForPrisma.prismaSignature === signature
    ? globalForPrisma.prisma
    : new PrismaClient({
        log: ['query'],
      })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
  globalForPrisma.prismaSignature = signature
}
