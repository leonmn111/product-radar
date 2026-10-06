import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";

// One PrismaClient per process. In dev, Next.js hot-reloads modules, so the
// instance is cached on globalThis to avoid opening a new pool on every edit.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;
