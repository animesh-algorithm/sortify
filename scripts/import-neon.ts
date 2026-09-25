import nextEnv from "@next/env";
import postgres from "postgres";
import { createClient } from "@libsql/client";
nextEnv.loadEnvConfig(process.cwd());
const tables = [
  "users",
  "sessions",
  "runs",
  "feature_cache",
  "publications",
] as const;
const sourceUrl = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
if (!sourceUrl || !process.env.TURSO_DATABASE_URL)
  throw new Error(
    "Configure NEON_DATABASE_URL and TURSO_DATABASE_URL before importing",
  );
const source = postgres(sourceUrl, {
  max: 1,
  prepare: false,
  connect_timeout: 10,
});
const target = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
try {
  // Read-only source snapshot; never modify or remove Neon records.
  const snapshot = await source.begin(
    "isolation level repeatable read read only",
    async (tx) => {
      const result: Record<string, Record<string, unknown>[]> = {};
      for (const table of tables)
        result[table] = await tx`select * from ${tx(table)}`;
      return result;
    },
  );
  const tx = await target.transaction("write");
  try {
    for (const table of tables) {
      const count = await tx.execute(
        `select count(*) as total from "${table}"`,
      );
      if (Number(count.rows[0].total) !== 0)
        throw new Error(
          "Import requires an empty destination; existing records will not be overwritten",
        );
    }
    for (const table of tables) {
      for (const row of snapshot[table]) {
        const columns = Object.keys(row);
        const args = columns.map((key) => {
          const value = row[key];
          if (value === null) return null;
          if (value instanceof Date) return value.getTime();
          if (typeof value === "boolean") return Number(value);
          if (typeof value === "object") return JSON.stringify(value);
          if (typeof value === "string" || typeof value === "number")
            return value;
          throw new Error(`Unsupported source value in ${table}.${key}`);
        });
        await tx.execute({
          sql: `insert into "${table}" (${columns.map((key) => '"' + key.replaceAll('"', '""') + '"').join(",")}) values (${columns.map(() => "?").join(",")})`,
          args,
        });
      }
      const count = await tx.execute(
        `select count(*) as total from "${table}"`,
      );
      if (Number(count.rows[0].total) !== snapshot[table].length)
        throw new Error(`Count verification failed for ${table}`);
    }
    await tx.commit();
    console.log(
      "Neon import complete:",
      Object.fromEntries(
        tables.map((table) => [table, snapshot[table].length]),
      ),
    );
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
} finally {
  target.close();
  await source.end({ timeout: 2 });
}
