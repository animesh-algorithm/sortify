import nextEnv from "@next/env";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
nextEnv.loadEnvConfig(process.cwd());
const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
try {
  await client.execute("PRAGMA foreign_keys = ON");
  await migrate(drizzle(client), { migrationsFolder: "./drizzle-turso" });
} finally {
  client.close();
}
