import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import { migrate } from "drizzle-orm/libsql/migrator";
import { drizzle } from "drizzle-orm/libsql";
import { eq, and } from "drizzle-orm";
import { users, sessions, runs, publications } from "../db/schema";
import { isActiveRunConflict } from "../lib/db-errors";
import type { RunData } from "../lib/model";
test("fresh migration enforces user ownership, sessions, single active run, and idempotent publications", async () => {
  const client = createClient({ url: ":memory:" });
  try {
    await client.execute("PRAGMA foreign_keys = ON");
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: "./drizzle-turso" });
    for (const id of ["alice", "bob"])
      await db.insert(users).values({
        id,
        name: id,
        access: "encrypted",
        refresh: "encrypted",
        expires: new Date(),
      });
    const data: RunData = {
      sources: [],
      tracks: [],
      suggestions: [],
      skipped: 0,
      enriched: 0,
      algorithm: "v1",
    };
    await db.insert(runs).values({
      id: "a",
      userId: "alice",
      mode: "groups",
      status: "queued",
      data,
    });
    await assert.rejects(
      () =>
        db.insert(runs).values({
          id: "duplicate",
          userId: "alice",
          mode: "groups",
          status: "importing",
          data,
        }),
      (error) => isActiveRunConflict(error),
    );
    const [saved] = await db.select().from(runs).where(eq(runs.id, "a"));
    assert.deepEqual(saved.data, data);
    assert.equal(saved.cancelled, false);
    assert.ok(saved.created instanceof Date);
    assert.ok(Number.isFinite(saved.created.getTime()));
    await assert.rejects(() =>
      db.transaction(async (tx) => {
        await tx.update(runs).set({ revision: 9 }).where(eq(runs.id, "a"));
        throw new Error("rollback");
      }),
    );
    assert.equal(
      (await db.select().from(runs).where(eq(runs.id, "a")))[0].revision,
      0,
    );
    await db.insert(runs).values({
      id: "b",
      userId: "bob",
      mode: "groups",
      status: "queued",
      data,
    });
    assert.equal(
      (
        await db
          .select()
          .from(runs)
          .where(and(eq(runs.id, "a"), eq(runs.userId, "bob")))
      ).length,
      0,
    );
    await db
      .insert(sessions)
      .values({ id: "hashed-session", userId: "alice", expires: new Date() });
    await db.insert(publications).values({
      id: "p",
      runId: "a",
      suggestionId: "s",
      revision: 1,
      name: "Playlist",
      trackIds: ["x"],
    });
    await db
      .insert(publications)
      .values({
        id: "p2",
        runId: "a",
        suggestionId: "s",
        revision: 1,
        name: "Playlist",
        trackIds: ["x"],
      })
      .onConflictDoNothing();
    assert.equal((await db.select().from(publications)).length, 1);
    await db.delete(users).where(eq(users.id, "alice"));
    assert.equal((await db.select().from(sessions)).length, 0);
    assert.equal((await db.select().from(publications)).length, 0);
  } finally {
    client.close();
  }
});
