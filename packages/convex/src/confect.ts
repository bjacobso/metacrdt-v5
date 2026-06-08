export type ManualConfectMountDecision =
  | "helper"
  | "docs-recipe"
  | "defer";

export const confectSidecarWarning =
  "Do not run raw `confect codegen` against a hand-written Convex app: Confect treats the configured functions directory as generated output. Use an isolated target or a package-owned integration.";
