export const ROUTES = {
  overview: "/",
  entities: "/entities",
  compliance: "/compliance",
  flows: "/flows",
  accountConfig: "/config",
  systemConsole: "/system",
  transactions: "/transactions",
  legacyDataModel: "/data-model",
} as const;

export function splitTenantPath(pathname: string): {
  tenantSlug: string | null;
  route: string;
} {
  const match = /^\/t\/([^/]+)(\/.*)?$/.exec(pathname);
  if (match === null) return { tenantSlug: null, route: pathname || ROUTES.overview };
  const [, encodedSlug, rest] = match;
  let tenantSlug = encodedSlug ?? "";
  try {
    tenantSlug = decodeURIComponent(tenantSlug);
  } catch {
    tenantSlug = encodedSlug ?? "";
  }
  return {
    tenantSlug,
    route: rest === undefined || rest === "" ? ROUTES.overview : rest,
  };
}

export function tenantPath(
  tenantSlug: string | null | undefined,
  route: string = ROUTES.overview,
): string {
  if (!tenantSlug) return route;
  const normalizedRoute =
    route === ROUTES.overview ? "" : route.startsWith("/") ? route : `/${route}`;
  return `/t/${encodeURIComponent(tenantSlug)}${normalizedRoute}`;
}

export const PAGE_TITLES: Record<string, string> = {
  [ROUTES.overview]: "Overview",
  [ROUTES.entities]: "Entities",
  [ROUTES.compliance]: "Compliance",
  [ROUTES.flows]: "Flows",
  [ROUTES.accountConfig]: "Account Config",
  [ROUTES.systemConsole]: "System Console",
  [ROUTES.transactions]: "Transaction log",
};

export const CONFIGURE_NAV = [
  { to: ROUTES.accountConfig, label: "Account Config" },
  { to: ROUTES.systemConsole, label: "System Console" },
  { to: ROUTES.transactions, label: "Transaction log" },
] as const;

export const TOUR_STEPS = [
  {
    route: ROUTES.overview,
    eyebrow: "1 / 6 · Substrate",
    title: "Start with the whole account",
    body:
      "The Overview page is the buyer-facing proof: types, placements, evidence reuse, obligations, and transactions are all projections over the same fact log.",
    focus: "Watch the stat cards and compliance table change as facts arrive.",
  },
  {
    route: ROUTES.entities,
    eyebrow: "2 / 6 · Facts become objects",
    title: "Inspect entities as folded state",
    body:
      "Entities are not rows in a bespoke app table. They are current projections of facts, ordered by declared schema, with system/configured/data origins kept visible.",
    focus: "Open Worker, Placement, or the component-owned entity section.",
  },
  {
    route: ROUTES.compliance,
    eyebrow: "3 / 6 · Rules become obligations",
    title: "Compliance falls out of rules",
    body:
      "Requirements and open tasks are derived facts. Submitting evidence asserts a scoped submission fact; reuse and task clearing are just recomputation.",
    focus: "Set up staffing, submit a form, then compare required vs open.",
  },
  {
    route: ROUTES.flows,
    eyebrow: "4 / 6 · Effects park and resume",
    title: "Flows are durable DAGs",
    body:
      "Collect steps park with a token, wait steps park on scheduler ticks, and actions assert facts. The event path resumes the run when the world changes.",
    focus: "Start the onboarding flow for worker:maria and inspect the run timeline.",
  },
  {
    route: ROUTES.systemConsole,
    eyebrow: "5 / 6 · The machine is visible",
    title: "Inspect engine state",
    body:
      "The System Console exposes system processes, action definitions, Datalog, raw fact assertion, and provenance without leaving the app.",
    focus: "Run the sample Datalog query or inspect the action registry.",
  },
  {
    route: ROUTES.transactions,
    eyebrow: "6 / 6 · Time is a coordinate",
    title: "Audit is a first-class read model",
    body:
      "The transaction log and bitemporal views show why MetaCRDT is more than current state: history, validity, corrections, and provenance remain queryable.",
    focus: "Compare as-of reads against the newest transaction stream.",
  },
] as const;
