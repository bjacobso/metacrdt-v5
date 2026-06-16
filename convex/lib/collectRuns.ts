import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { COLLECT_TOKEN_TTL_MS, isLiveToken } from "./collect";

/**
 * Issue or reuse the simple collection run used by configured actions.
 *
 * This deliberately does not schedule reminder/escalation ticks; the full flow
 * runner in `flows.ts` owns those. Actions need the lightweight "give me a
 * token for this subject/form/scope" behavior, and component-owned action
 * wrappers reuse the same bridge while selecting where submission folds.
 */
export async function issueActionCollectRun(
  ctx: MutationCtx,
  args: {
    tenantId: Id<"tenants">;
    subject: string;
    form: string;
    scope: string;
    collectionTarget?: "host" | "component";
  },
): Promise<{
  runId: Id<"flowRuns">;
  token: string;
  collectUrl: string;
  reused: boolean;
}> {
  const collectionTarget = args.collectionTarget ?? "host";
  const existing = await ctx.db
    .query("flowRuns")
    .withIndex("by_tenant_and_target", (q) =>
      q
        .eq("tenantId", args.tenantId)
        .eq("subject", args.subject)
        .eq("form", args.form)
        .eq("scope", args.scope),
    )
    .collect();
  const now = Date.now();
  const live = existing.find((r) => isLiveToken(r, now, collectionTarget));
  if (live) {
    return {
      runId: live._id,
      token: live.token!,
      collectUrl: `/collect?token=${live.token}`,
      reused: true,
    };
  }

  const token = crypto.randomUUID();
  const runId = await ctx.db.insert("flowRuns", {
    tenantId: args.tenantId,
    flowName: "collect",
    subject: args.subject,
    form: args.form,
    scope: args.scope,
    status: "waiting",
    step: "issued",
    issuedAt: now,
    updatedAt: now,
    token,
    tokenExpiresAt: now + COLLECT_TOKEN_TTL_MS,
    collectionTarget,
  });
  await ctx.db.insert("flowEvents", {
    tenantId: args.tenantId,
    runId,
    ts: now,
    kind: "issued",
    message: `collect ${args.form} for ${args.scope}`,
  });
  return { runId, token, collectUrl: `/collect?token=${token}`, reused: false };
}
