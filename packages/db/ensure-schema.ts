import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { Client } from "pg";

import { env } from "./env";

const migrationName = "20260125013336_init";
const migrationPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "./prisma/migrations/20260125013336_init/migration.sql",
);
const migrationSql = readFileSync(migrationPath, "utf8");
const migrationChecksum = createHash("sha256").update(migrationSql).digest("hex");

let ensureSchemaPromise: Promise<void> | undefined;

type SchemaStateRow = {
  room_exists: string | null;
  question_set_exists: string | null;
  leaderboard_exists: string | null;
  user_exists: string | null;
  migrations_exists: string | null;
};

async function bootstrapInitialSchema() {
  const client = new Client({ connectionString: env.DATABASE_URL });

  await client.connect();

  try {
    await client.query("SELECT pg_advisory_lock(982451653)");

    const stateResult = await client.query<SchemaStateRow>(`
      SELECT
        to_regclass('public.room') AS room_exists,
        to_regclass('public.question_set') AS question_set_exists,
        to_regclass('public.leaderboard') AS leaderboard_exists,
        to_regclass('public."user"') AS user_exists,
        to_regclass('public._prisma_migrations') AS migrations_exists
    `);

    const state = stateResult.rows[0];
    const coreTables = [
      state?.room_exists,
      state?.question_set_exists,
      state?.leaderboard_exists,
      state?.user_exists,
    ];

    if (coreTables.every(Boolean)) {
      return;
    }

    if (coreTables.some(Boolean)) {
      throw new Error("Automatic schema bootstrap aborted because the database is only partially initialized.");
    }

    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS "public"."_prisma_migrations" (
        "id" VARCHAR(36) PRIMARY KEY,
        "checksum" VARCHAR(64) NOT NULL,
        "finished_at" TIMESTAMPTZ,
        "migration_name" VARCHAR(255) NOT NULL,
        "logs" TEXT,
        "rolled_back_at" TIMESTAMPTZ,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0
      )
    `);
    await client.query(migrationSql);
    await client.query(
      `
        INSERT INTO "public"."_prisma_migrations" (
          "id",
          "checksum",
          "finished_at",
          "migration_name",
          "rolled_back_at",
          "started_at",
          "applied_steps_count"
        )
        VALUES ($1, $2, now(), $3, NULL, now(), 1)
        ON CONFLICT ("id") DO NOTHING
      `,
      [randomUUID(), migrationChecksum, migrationName],
    );
    await client.query("COMMIT");

    console.warn("[db] bootstrapped initial Prisma schema from runtime");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.query("SELECT pg_advisory_unlock(982451653)").catch(() => undefined);
    await client.end();
  }
}

export function ensureDatabaseSchema() {
  ensureSchemaPromise ??= bootstrapInitialSchema().catch((error) => {
    ensureSchemaPromise = undefined;
    throw error;
  });

  return ensureSchemaPromise;
}
