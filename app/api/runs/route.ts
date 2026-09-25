import { randomUUID } from "node:crypto";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { sameOrigin, requireUser } from "../../../lib/auth";
import { sources } from "../../../lib/spotify";
import { db } from "../../../lib/db";
import { runs } from "../../../db/schema";
import { dispatchRun } from "../../../lib/dispatch";
import { ALGORITHM } from "../../../lib/model";
import { failure } from "../../../lib/http";
import { isActiveRunConflict } from "../../../lib/db-errors";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const u = await requireUser(),
      input = z
        .object({
          sources: z.array(z.string()).min(1).max(100),
          mode: z.enum(["groups", "activity", "blend"]).default("blend"),
        })
        .parse(await req.json());
    const [active] = await db()
      .select({ id: runs.id })
      .from(runs)
      .where(
        and(
          eq(runs.userId, u.id),
          inArray(runs.status, [
            "queued",
            "importing",
            "enriching",
            "analyzing",
            "publishing",
          ]),
        ),
      )
      .limit(1);
    if (active) throw new Error("Run already active");
    const accessible = await sources(u.id),
      selected = accessible.filter((s) => input.sources.includes(s.id));
    if (selected.length !== new Set(input.sources).size)
      throw new Error("Invalid source");
    const id = randomUUID();
    await db()
      .insert(runs)
      .values({
        id,
        userId: u.id,
        mode: input.mode,
        status: "queued",
        data: {
          sources: selected,
          tracks: [],
          suggestions: [],
          skipped: 0,
          enriched: 0,
          algorithm: ALGORITHM,
        },
      });
    await dispatchRun(id, "sortify/organize", `organization-${id}`);
    return Response.json({ id }, { status: 201 });
  } catch (e) {
    if (isActiveRunConflict(e)) return failure(new Error("Run already active"));
    return failure(e);
  }
}
