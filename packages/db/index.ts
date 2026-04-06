import { PrismaClient } from "./generated/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { env } from "./env";
export { ensureDatabaseSchema } from "./ensure-schema";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

export const db = globalForPrisma.prisma || createPrismaClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export * from "./generated/client"
