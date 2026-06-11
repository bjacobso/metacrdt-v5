import { MutationCtx } from "../_generated/server";

export const WRITE_DENIED = "Not authenticated";

/**
 * Server-derived principal for write authorization. Public mutations must never
 * trust actor/user identifiers from args; callers prove write access by
 * presenting Convex auth identity. The `/collect` token path is deliberately
 * separate and does not use this helper.
 */
export async function requireWritePrincipal(ctx: MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error(WRITE_DENIED);
  return identity.tokenIdentifier;
}
