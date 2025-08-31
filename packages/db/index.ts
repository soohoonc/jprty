import { PrismaClient } from "./generated/client";

import { env } from "./env";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const db = globalForPrisma.prisma || new PrismaClient({
  log: env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
});

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export * from "./generated/client"
export type { DefaultArgs } from "./generated/client/runtime/library"