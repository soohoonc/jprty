import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const envFilePath = resolve(dirname(fileURLToPath(import.meta.url)), "../../.env");

loadEnv({ path: envFilePath });

const envSchema = z.object({
  DATABASE_URL: z.string(),
  DIRECT_URL: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const envValues = {
  DATABASE_URL: process.env.DATABASE_URL,
  DIRECT_URL: process.env.DIRECT_URL,
  NODE_ENV: process.env.NODE_ENV,
} as const;

const formatErrors = (errors: z.ZodError) => {
  const { fieldErrors } = z.flattenError(errors) as { fieldErrors: Record<string, string[]> };
  const errorMessage = Object.entries(fieldErrors)
    .map(([field, errors]) =>
      `${field}: ${errors?.join(", ")}`)
    .join("\n");
  return errorMessage;
};

if (!process.env.SKIP_ENV_VALIDATION) {
  try {
    envSchema.parse(envValues);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(
        `❌ Invalid environment variables:\n${formatErrors(error)}\n` +
        `💡 Tip: Check your .env file`
      );
    }
  }
}

export const env = {
  ...envValues,
} as const;
