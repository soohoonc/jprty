import { config as loadEnv } from "dotenv"
import { resolve } from "node:path"
import { defineConfig, env } from "prisma/config"

loadEnv({ path: resolve(import.meta.dirname, "../../.env") })

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
})
