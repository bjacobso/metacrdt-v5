import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireTenant } from "./lib/tenantAuth";

const SOURCE_FORMAT = v.union(
  v.literal("json"),
  v.literal("yaml"),
  v.literal("forma"),
);

const DIAGNOSTIC = v.object({
  message: v.string(),
  loc: v.optional(v.object({ line: v.number(), col: v.number() })),
  path: v.optional(v.string()),
});

type DraftDiagnostic = {
  message: string;
  loc?: { line: number; col: number };
  path?: string;
};

type DraftValidation = {
  valid: boolean;
  errors: string[];
};

type DraftRow = {
  tenantId: Id<"tenants">;
  tenantSlug: string;
  name: string;
  source: string;
  sourceFormat: "json" | "yaml" | "forma";
  sourceDigest: string;
  checkedInPath?: string;
  checkedInDigest?: string;
  reviewNote?: string;
  artifactDigest?: string;
  diagnostics: DraftDiagnostic[];
  validation?: DraftValidation;
  updatedAt: number;
  updatedBy: string;
};

type SaveDraftResult = {
  draftId: Id<"accountConfigDrafts">;
  created: boolean;
  sourceDigest: string;
  artifactDigest?: string;
  validation: DraftValidation | null;
};

function sourceDigest(source: string): string {
  let h1 = 0xdeadbeef ^ source.length;
  let h2 = 0x41c6ce57 ^ source.length;
  for (let i = 0; i < source.length; i++) {
    const ch = source.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const digest = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return `cyrb53:${digest.toString(16).padStart(14, "0")}`;
}

function normalizeName(name: string | undefined): string {
  const trimmed = (name ?? "default").trim();
  return trimmed === "" ? "default" : trimmed.slice(0, 80);
}

function normalizeOptionalText(
  value: string | undefined,
  limit: number,
): string | undefined {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? undefined : trimmed.slice(0, limit);
}

function normalizeDiagnostics(
  diagnostics: DraftDiagnostic[],
): DraftDiagnostic[] {
  return diagnostics.slice(0, 50).map((diagnostic) => {
    const row: DraftDiagnostic = { message: diagnostic.message.slice(0, 500) };
    if (diagnostic.loc !== undefined) {
      row.loc = {
        line: diagnostic.loc.line,
        col: diagnostic.loc.col,
      };
    }
    if (diagnostic.path !== undefined) {
      row.path = diagnostic.path.slice(0, 200);
    }
    return row;
  });
}

async function latestNamedDraft(
  ctx: QueryCtx | MutationCtx,
  tenantId: Id<"tenants">,
  name: string,
): Promise<Doc<"accountConfigDrafts"> | null> {
  const rows = await ctx.db
    .query("accountConfigDrafts")
    .withIndex("by_tenant_and_name_and_updatedAt", (q) =>
      q.eq("tenantId", tenantId).eq("name", name),
    )
    .order("desc")
    .take(1);
  return rows[0] ?? null;
}

export const listDrafts = query({
  args: { tenantSlug: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<Doc<"accountConfigDrafts">[]> => {
    const tenant = await requireTenant(ctx, args.tenantSlug);
    return await ctx.db
      .query("accountConfigDrafts")
      .withIndex("by_tenant_and_updatedAt", (q) =>
        q.eq("tenantId", tenant.tenantId),
      )
      .order("desc")
      .take(Math.min(args.limit ?? 10, 50));
  },
});

export const latestDraft = query({
  args: { tenantSlug: v.string(), name: v.optional(v.string()) },
  handler: async (ctx, args): Promise<Doc<"accountConfigDrafts"> | null> => {
    const tenant = await requireTenant(ctx, args.tenantSlug);
    return await latestNamedDraft(
      ctx,
      tenant.tenantId,
      normalizeName(args.name),
    );
  },
});

export const saveDraft = mutation({
  args: {
    tenantSlug: v.string(),
    name: v.optional(v.string()),
    source: v.string(),
    sourceFormat: SOURCE_FORMAT,
    config: v.optional(v.any()),
    artifactDigest: v.optional(v.string()),
    checkedInPath: v.optional(v.string()),
    checkedInDigest: v.optional(v.string()),
    reviewNote: v.optional(v.string()),
    diagnostics: v.array(DIAGNOSTIC),
  },
  handler: async (ctx, args): Promise<SaveDraftResult> => {
    const tenant = await requireTenant(ctx, args.tenantSlug, "editor");
    const name = normalizeName(args.name);
    const diagnostics = normalizeDiagnostics(args.diagnostics);
    const validation: DraftValidation | undefined =
      args.config === undefined
        ? undefined
        : await ctx.runQuery(api.appconfig.planConfig, {
            tenantSlug: tenant.tenantSlug,
            config: args.config,
          });
    const validationSummary: DraftValidation | undefined =
      validation === undefined
        ? undefined
        : {
            valid: validation.valid,
            errors: validation.errors.slice(0, 50),
          };
    const now = Date.now();
    const existing = await latestNamedDraft(ctx, tenant.tenantId, name);
    const checkedInPath = normalizeOptionalText(args.checkedInPath, 240);
    const checkedInDigest = normalizeOptionalText(args.checkedInDigest, 120);
    const reviewNote = normalizeOptionalText(args.reviewNote, 2_000);
    const row: DraftRow = {
      tenantId: tenant.tenantId,
      tenantSlug: tenant.tenantSlug,
      name,
      source: args.source,
      sourceFormat: args.sourceFormat,
      sourceDigest: sourceDigest(args.source),
      ...(checkedInPath === undefined ? {} : { checkedInPath }),
      ...(checkedInDigest === undefined ? {} : { checkedInDigest }),
      ...(reviewNote === undefined ? {} : { reviewNote }),
      ...(args.artifactDigest === undefined
        ? {}
        : { artifactDigest: args.artifactDigest }),
      diagnostics,
      ...(validationSummary === undefined
        ? {}
        : { validation: validationSummary }),
      updatedAt: now,
      updatedBy: tenant.principal,
    };

    if (existing === null) {
      const draftId = await ctx.db.insert("accountConfigDrafts", {
        ...row,
        createdAt: now,
      });
      return {
        draftId,
        created: true,
        sourceDigest: row.sourceDigest,
        artifactDigest: args.artifactDigest,
        validation: validationSummary ?? null,
      };
    }

    await ctx.db.replace(existing._id, {
      ...row,
      createdAt: existing.createdAt,
    });
    return {
      draftId: existing._id,
      created: false,
      sourceDigest: row.sourceDigest,
      artifactDigest: args.artifactDigest,
      validation: validationSummary ?? null,
    };
  },
});

export const deleteDraft = mutation({
  args: { tenantSlug: v.string(), draftId: v.id("accountConfigDrafts") },
  handler: async (ctx, args): Promise<{ deleted: boolean }> => {
    const tenant = await requireTenant(ctx, args.tenantSlug, "editor");
    const draft = await ctx.db.get(args.draftId);
    if (draft === null) return { deleted: false };
    if (draft.tenantId !== tenant.tenantId) {
      throw new Error("Tenant access denied");
    }
    await ctx.db.delete(args.draftId);
    return { deleted: true };
  },
});
