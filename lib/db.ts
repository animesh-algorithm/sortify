import "server-only";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../db/schema";
let instance: ReturnType<typeof drizzle<typeof schema>>;
export function db() {
  if (!process.env.TURSO_DATABASE_URL)
    throw new Error("Database is not configured");
  return (instance ??= drizzle(
    createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    }),
    { schema },
  ));
}
