import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";
loadEnvConfig(process.cwd());
export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle-turso",
  dialect: "turso",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL ?? "file:./sortify.db",
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});
