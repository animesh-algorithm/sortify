import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import type { Features, RunData } from "../lib/model";
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  access: text("access").notNull(),
  refresh: text("refresh").notNull(),
  expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
});
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
});
export const runs = sqliteTable(
  "runs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mode: text("mode").notNull(),
    status: text("status").notNull(),
    revision: integer("revision").notNull().default(0),
    approvedRevision: integer("approved_revision"),
    cancelled: integer("cancelled", { mode: "boolean" })
      .notNull()
      .default(false),
    data: text("data", { mode: "json" }).$type<RunData>().notNull(),
    error: text("error"),
    created: integer("created", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsec') * 1000 as integer))`)
      .notNull(),
  },
  (t) => [
    uniqueIndex("one_active_run")
      .on(t.userId)
      .where(
        sql`${t.status} in ('queued','importing','enriching','analyzing','publishing')`,
      ),
  ],
);
export const featureCache = sqliteTable("feature_cache", {
  id: text("id").primaryKey(),
  features: text("features", { mode: "json" }).$type<Features>(),
  expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
});
export const publications = sqliteTable(
  "publications",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    suggestionId: text("suggestion_id").notNull(),
    revision: integer("revision").notNull(),
    name: text("name").notNull(),
    trackIds: text("track_ids", { mode: "json" }).$type<string[]>().notNull(),
    playlistId: text("playlist_id"),
    status: text("status").notNull().default("pending"),
    offset: integer("offset").notNull().default(0),
    uncertain: integer("uncertain", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (t) => [
    uniqueIndex("publication_revision").on(t.runId, t.suggestionId, t.revision),
  ],
);
