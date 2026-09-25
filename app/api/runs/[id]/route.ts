import { randomUUID } from "node:crypto";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { sameOrigin, requireUser } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { runs, publications } from "../../../../db/schema";
import { dispatchRun } from "../../../../lib/dispatch";
import {
  validateEdit,
  canPublish,
  importSelection,
  recluster,
  assertImportsUnchanged,
} from "../../../../lib/workflow";
import { failure } from "../../../../lib/http";
const suggestion = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(100),
  trackIds: z.array(z.string()).max(10000),
  selected: z.boolean(),
});
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(req);
    const u = await requireUser(),
      { id } = await ctx.params;
    const input = z
      .discriminatedUnion("action", [
        z.object({
          action: z.literal("edit"),
          revision: z.number().int(),
          suggestions: z.array(suggestion).max(100),
        }),
        z.object({ action: z.literal("approve"), revision: z.number().int() }),
        z.object({ action: z.literal("publish"), revision: z.number().int() }),
        z.object({
          action: z.literal("import"),
          revision: z.number().int(),
          suggestionIds: z.array(z.string()).min(1).max(100),
        }),
        z.object({
          action: z.literal("recluster"),
          revision: z.number().int(),
          mode: z
            .enum(["groups", "activity", "artist", "blend"])
            .default("blend"),
        }),
        z.object({ action: z.literal("cancel") }),
        z.object({ action: z.literal("resume") }),
      ])
      .parse(await req.json());
    let dispatch: "sortify/organize" | "sortify/publish" | undefined;
    await db().transaction(async (tx) => {
      const [r] = await tx
        .select()
        .from(runs)
        .where(and(eq(runs.id, id), eq(runs.userId, u.id)));
      if (!r) throw new Error("Run not found");
      if ("revision" in input && r.revision !== input.revision)
        throw new Error("Revision changed");
      const existing = await tx
        .select()
        .from(publications)
        .where(eq(publications.runId, id));
      if (input.action === "recluster") {
        if (!["ready", "complete"].includes(r.status))
          throw new Error("Wait for the current operation to finish");
        await tx
          .update(runs)
          .set({
            data: recluster(
              r.data,
              input.mode,
              r.revision,
              existing.map((p) => p.suggestionId),
            ),
            mode: input.mode,
            revision: r.revision + 1,
            approvedRevision: null,
            status: "ready",
            error: null,
          })
          .where(eq(runs.id, id));
        return;
      }
      if (input.action === "import") {
        if (!["ready", "complete"].includes(r.status))
          throw new Error("Wait for the current import to finish");
        const chosen = importSelection(
          r.data,
          input.suggestionIds,
          existing.map((p) => p.suggestionId),
        );
        for (const s of chosen) {
          await tx.insert(publications).values({
            id: randomUUID(),
            runId: id,
            suggestionId: s.id,
            revision: r.revision,
            name: s.name,
            trackIds: s.trackIds,
          });
        }
        await tx
          .update(runs)
          .set({ status: "publishing", error: null })
          .where(eq(runs.id, id));
        dispatch = "sortify/publish";
        return;
      }
      if (input.action === "cancel") {
        if (["publishing", "publish_failed", "complete"].includes(r.status))
          throw new Error("Publishing cannot be cancelled");
        await tx
          .update(runs)
          .set({ cancelled: true, status: "cancelled", approvedRevision: null })
          .where(eq(runs.id, id));
        return;
      }
      if (input.action === "resume") {
        if (r.cancelled) throw new Error("Run cancelled");
        if (["queued", "failed"].includes(r.status)) {
          dispatch = "sortify/organize";
          await tx
            .update(runs)
            .set({ status: "queued", error: null })
            .where(eq(runs.id, id));
        } else if (["publishing", "publish_failed"].includes(r.status)) {
          dispatch = "sortify/publish";
          await tx
            .update(runs)
            .set({ status: "publishing", error: null })
            .where(eq(runs.id, id));
        } else throw new Error("Cannot resume");
        return;
      }
      if (input.action === "edit") {
        assertImportsUnchanged(
          r.data.suggestions,
          input.suggestions,
          existing.map((p) => p.suggestionId),
        );
        await tx
          .update(runs)
          .set(validateEdit(r, input.revision, input.suggestions))
          .where(eq(runs.id, id));
        return;
      }
      if (input.action === "approve") {
        if (
          r.status !== "ready" ||
          !r.data.suggestions.some((s) => s.selected && s.trackIds.length)
        )
          throw new Error("Nothing selected");
        await tx
          .update(runs)
          .set({ approvedRevision: r.revision })
          .where(eq(runs.id, id));
        return;
      }
      if (input.action === "publish") {
        if (["publishing", "complete"].includes(r.status)) return;
        if (!canPublish(r, input.revision))
          throw new Error("Approve your changes first");
        for (const s of r.data.suggestions.filter(
          (s) =>
            s.selected &&
            s.trackIds.length &&
            !existing.some((p) => p.suggestionId === s.id),
        )) {
          await tx
            .insert(publications)
            .values({
              id: randomUUID(),
              runId: id,
              suggestionId: s.id,
              revision: r.revision,
              name: s.name,
              trackIds: s.trackIds,
            })
            .onConflictDoNothing();
        }
        await tx
          .update(runs)
          .set({ status: "publishing", error: null })
          .where(eq(runs.id, id));
        dispatch = "sortify/publish";
      }
    });
    if (dispatch) await dispatchRun(id, dispatch);
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
