// @metacrdt/query — pure Datalog/query helpers.
//
// This first package slice owns target-neutral query syntax and deterministic
// row operations. It deliberately does not fetch triples, read auth policy, or
// schedule joins against a database; target runtimes provide those edges.

export const LIMITS = {
  maxClauses: 16,
  maxOrBranches: 8,
  maxIntermediateRows: 5_000,
  maxResultRows: 1_000,
  maxPageSize: 100,
  maxClauseScan: 2_000,
  allowRecursion: false,
} as const;

export const COMPARISON_OPS = new Set([">", "<", ">=", "<=", "==", "!="]);
export const COMPUTE_OPS = new Set([
  "+",
  "-",
  "*",
  "/",
  "%",
  "add",
  "sub",
  "mul",
  "div",
  "mod",
  "min",
  "max",
  "abs",
  "floor",
  "ceil",
  "round",
  "concat",
  "lower",
  "upper",
  "trim",
  "length",
  "contains",
  "startsWith",
  "endsWith",
]);

export type Binding = Record<string, unknown>;
export type EmitSpec = { e: string; a: string; v: unknown };
export type DerivedRow = { e: string; a: string; v: unknown };
export type ProvenancedBinding<
  SourceId extends string = string,
  EventSourceId extends string = string,
> = {
  binding: Binding;
  sources: SourceId[];
  eventSources?: EventSourceId[];
};
export type QueryTriple<
  SourceId extends string = string,
  EventSourceId extends string = string,
> = {
  e: string;
  a: string;
  v: unknown;
  prov: SourceId[];
  eventProv?: EventSourceId[];
};
export type PatternInput = {
  eConst?: unknown;
  aConst?: unknown;
  vConst?: unknown;
  vIsConst: boolean;
};

export type Term =
  | { kind: "var"; name: string }
  | { kind: "const"; value: unknown };

export type PatternClause = { kind: "pattern"; e: Term; a: Term; v: Term };
export type CompareClause = { kind: "compare"; left: Term; op: string; right: Term };
export type ComputeClause = { kind: "compute"; op: string; args: Term[]; as?: Term };
export type NotClause = { kind: "not"; pattern: PatternClause };
export type OrClause = { kind: "or"; branches: AnyClause[][] };
export type AnyClause =
  | PatternClause
  | CompareClause
  | ComputeClause
  | NotClause
  | OrClause;

export type ClauseDescription =
  | { kind: "pattern"; e: string; a: string; v: string }
  | { kind: "compare"; left: string; op: string; right: string }
  | { kind: "compute"; op: string; args: string[]; as?: string }
  | { kind: "not"; e: string; a: string; v: string }
  | { kind: "or"; branches: ClauseDescription[][] };

export function valueKey(value: unknown): string {
  if (value === null || value === undefined) return "null";
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") {
    return `${t}:${String(value)}`;
  }
  return `json:${JSON.stringify(value)}`;
}

/** Strings beginning with `?` are variables; everything else is a constant. */
export function parseTerm(raw: unknown): Term {
  if (typeof raw === "string" && raw.startsWith("?")) {
    return { kind: "var", name: raw.slice(1) };
  }
  return { kind: "const", value: raw };
}

export function parsePattern(raw: unknown): PatternClause {
  if (!Array.isArray(raw) || raw.length !== 3) {
    throw new Error("a fact pattern must be a [e, a, v] triple");
  }
  return {
    kind: "pattern",
    e: parseTerm(raw[0]),
    a: parseTerm(raw[1]),
    v: parseTerm(raw[2]),
  };
}

export function parseClause(raw: unknown): AnyClause {
  if (raw && typeof raw === "object" && !Array.isArray(raw) && "not" in raw) {
    return { kind: "not", pattern: parsePattern((raw as { not: unknown }).not) };
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw) && "or" in raw) {
    const branches = (raw as { or: unknown }).or;
    if (!Array.isArray(branches) || branches.length === 0) {
      throw new Error("or clause must be { or: [whereBranch, ...] }");
    }
    if (branches.length > LIMITS.maxOrBranches) {
      throw new Error(
        `or clause has ${branches.length} branches, exceeding maxOrBranches=${LIMITS.maxOrBranches}`,
      );
    }
    return {
      kind: "or",
      branches: branches.map((branch) => {
        if (!Array.isArray(branch)) {
          throw new Error("each or branch must be an array of clauses");
        }
        const parsed = branch.map(parseClause);
        if (parsed.some((clause) => clause.kind === "or")) {
          throw new Error("nested or clauses are not supported");
        }
        return parsed;
      }),
    };
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw) && "compute" in raw) {
    const spec = (raw as { compute: unknown; as?: unknown }).compute;
    if (!Array.isArray(spec) || spec.length === 0) {
      throw new Error("compute clause must be { compute: [op, ...args], as?: term }");
    }
    const op = spec[0];
    if (typeof op !== "string" || !COMPUTE_OPS.has(op)) {
      throw new Error(`unknown compute operator: ${String(op)}`);
    }
    return {
      kind: "compute",
      op,
      args: spec.slice(1).map(parseTerm),
      ...((raw as { as?: unknown }).as === undefined
        ? {}
        : { as: parseTerm((raw as { as?: unknown }).as) }),
    };
  }
  if (Array.isArray(raw) && raw.length === 3) {
    if (typeof raw[1] === "string" && COMPARISON_OPS.has(raw[1])) {
      return {
        kind: "compare",
        left: parseTerm(raw[0]),
        op: raw[1],
        right: parseTerm(raw[2]),
      };
    }
    return parsePattern(raw);
  }
  throw new Error(
    "each clause must be a [e, a, v] triple, a [term, op, term] comparison, { compute: [op, ...args], as?: term }, { not: [e, a, v] }, or { or: [[...], ...] }",
  );
}

export function parseClauses(where: unknown[]): AnyClause[] {
  const clauses = where.map(parseClause);
  const clauseCount =
    clauses.length +
    clauses
      .filter((clause): clause is OrClause => clause.kind === "or")
      .reduce(
        (sum, clause) =>
          sum + clause.branches.reduce((n, branch) => n + branch.length, 0),
        0,
      );
  if (clauseCount > LIMITS.maxClauses) {
    throw new Error(
      `query has ${clauseCount} clauses, exceeding maxClauses=${LIMITS.maxClauses}`,
    );
  }
  return clauses;
}

export function resolveTerm(term: Term, binding: Binding): Term {
  if (term.kind === "var" && term.name in binding) {
    return { kind: "const", value: binding[term.name] };
  }
  return term;
}

export function termVars(term: Term): string[] {
  return term.kind === "var" ? [term.name] : [];
}

export function requiredVars(clause: AnyClause): string[] {
  if (clause.kind === "compare") {
    return [...termVars(clause.left), ...termVars(clause.right)];
  }
  if (clause.kind === "not") {
    const p = clause.pattern;
    return [...termVars(p.e), ...termVars(p.a), ...termVars(p.v)];
  }
  if (clause.kind === "compute") {
    return clause.args.flatMap(termVars);
  }
  if (clause.kind === "or") {
    const required = new Set<string>();
    for (const branch of clause.branches) {
      for (const vn of branchExternalRequiredVars(branch)) required.add(vn);
    }
    return [...required];
  }
  return [];
}

export function patternVars(p: PatternClause): string[] {
  return [...termVars(p.e), ...termVars(p.a), ...termVars(p.v)];
}

export function clauseBoundVars(clause: AnyClause): string[] {
  if (clause.kind === "pattern") return patternVars(clause);
  if (clause.kind === "compute") {
    return clause.as?.kind === "var" ? [clause.as.name] : [];
  }
  if (clause.kind === "or") {
    return [
      ...new Set(
        clause.branches.flatMap((branch) => branch.flatMap(clauseBoundVars)),
      ),
    ];
  }
  return [];
}

export function branchExternalRequiredVars(branch: AnyClause[]): string[] {
  const produced = new Set<string>();
  for (const clause of branch) {
    for (const vn of clauseBoundVars(clause)) produced.add(vn);
  }
  const required = new Set<string>();
  for (const clause of branch) {
    for (const vn of requiredVars(clause)) {
      if (!produced.has(vn)) required.add(vn);
    }
  }
  return [...required];
}

export function dynamicSelectivity(p: PatternClause, bound: Set<string>): number {
  const known = (t: Term) =>
    t.kind === "const" || (t.kind === "var" && bound.has(t.name));
  let score = 0;
  if (known(p.a)) score += 4;
  if (known(p.e)) score += 2;
  if (known(p.v)) score += 1;
  return score;
}

/**
 * Pick the next clause to evaluate from `remaining`, returning the position in
 * that `remaining` array. This is the pure planning half of the Datalog
 * scheduler: non-pattern clauses run as soon as their required vars are bound;
 * otherwise the most selective pattern runs next. Target runtimes still own
 * fetching, joins, provenance, read auth, and async execution.
 */
export function chooseNextClausePosition(
  clauses: AnyClause[],
  remaining: number[],
  bound: ReadonlySet<string>,
): number {
  const runnableFilter = remaining.findIndex((i) => {
    const c = clauses[i];
    return (
      c !== undefined &&
      c.kind !== "pattern" &&
      requiredVars(c).every((vn) => bound.has(vn))
    );
  });
  if (runnableFilter !== -1) return runnableFilter;

  let best = -1;
  let bestScore = -1;
  const boundSet = bound instanceof Set ? bound : new Set(bound);
  for (let k = 0; k < remaining.length; k++) {
    const idx = remaining[k];
    if (idx === undefined) continue;
    const c = clauses[idx];
    if (c === undefined || c.kind !== "pattern") continue;
    const score = dynamicSelectivity(c, boundSet);
    if (score > bestScore) {
      bestScore = score;
      best = k;
    }
  }
  if (best !== -1) return best;

  throw new Error(
    "query is unsafe: a comparison, compute, negation, or disjunction clause has variables that no earlier clause can bind",
  );
}

export function unifyPattern(
  clause: PatternClause,
  binding: Binding,
  triple: { e: string; a: string; v: unknown },
): Binding | null {
  const next: Binding = { ...binding };
  for (const [term, fieldVal] of [
    [clause.e, triple.e],
    [clause.a, triple.a],
    [clause.v, triple.v],
  ] as const) {
    if (term.kind === "const") {
      if (valueKey(term.value) !== valueKey(fieldVal)) return null;
    } else if (term.name in next) {
      if (valueKey(next[term.name]) !== valueKey(fieldVal)) return null;
    } else {
      next[term.name] = fieldVal;
    }
  }
  return next;
}

export function patternInputForBinding(
  clause: PatternClause,
  binding: Binding,
): PatternInput {
  const e = resolveTerm(clause.e, binding);
  const a = resolveTerm(clause.a, binding);
  const v = resolveTerm(clause.v, binding);
  return {
    eConst: e.kind === "const" ? e.value : undefined,
    aConst: a.kind === "const" ? a.value : undefined,
    vConst: v.kind === "const" ? v.value : undefined,
    vIsConst: v.kind === "const",
  };
}

export function compareValues(left: unknown, op: string, right: unknown): boolean {
  if (op === "==") return valueKey(left) === valueKey(right);
  if (op === "!=") return valueKey(left) !== valueKey(right);
  let cmp: number;
  if (typeof left === "number" && typeof right === "number") {
    cmp = left - right;
  } else {
    cmp = String(left).localeCompare(String(right));
  }
  switch (op) {
    case ">":
      return cmp > 0;
    case "<":
      return cmp < 0;
    case ">=":
      return cmp >= 0;
    case "<=":
      return cmp <= 0;
    default:
      throw new Error(`unknown comparison operator: ${op}`);
  }
}

export function satisfiesCompare(clause: CompareClause, binding: Binding): boolean {
  const l = resolveTerm(clause.left, binding);
  const r = resolveTerm(clause.right, binding);
  if (l.kind !== "const" || r.kind !== "const") {
    throw new Error(
      `comparison '${clause.op}' has an unbound variable — its operands must be bound by an earlier clause`,
    );
  }
  return compareValues(l.value, clause.op, r.value);
}

type ComputeResult = { ok: true; value: unknown } | { ok: false };

function requireArity(op: string, values: unknown[], min: number, max = min) {
  if (values.length < min || values.length > max) {
    throw new Error(
      `compute '${op}' expects ${min === max ? min : `${min}-${max}`} argument${
        max === 1 ? "" : "s"
      }, got ${values.length}`,
    );
  }
}

function numbers(values: unknown[]): number[] | null {
  return values.every((v): v is number => typeof v === "number" && Number.isFinite(v))
    ? values
    : null;
}

function strings(values: unknown[]): string[] | null {
  return values.every((v): v is string => typeof v === "string")
    ? values
    : null;
}

export function computeValue(op: string, values: unknown[]): ComputeResult {
  switch (op) {
    case "+":
    case "add": {
      requireArity(op, values, 2, 16);
      const ns = numbers(values);
      return ns === null
        ? { ok: false }
        : { ok: true, value: ns.reduce((a, b) => a + b, 0) };
    }
    case "-":
    case "sub": {
      requireArity(op, values, 1, 2);
      const ns = numbers(values);
      if (ns === null) return { ok: false };
      const [first, second] = ns;
      if (first === undefined) return { ok: false };
      return { ok: true, value: second === undefined ? -first : first - second };
    }
    case "*":
    case "mul": {
      requireArity(op, values, 2, 16);
      const ns = numbers(values);
      return ns === null
        ? { ok: false }
        : { ok: true, value: ns.reduce((a, b) => a * b, 1) };
    }
    case "/":
    case "div": {
      requireArity(op, values, 2);
      const ns = numbers(values);
      const [left, right] = ns ?? [];
      if (left === undefined || right === undefined || right === 0) {
        return { ok: false };
      }
      return { ok: true, value: left / right };
    }
    case "%":
    case "mod": {
      requireArity(op, values, 2);
      const ns = numbers(values);
      const [left, right] = ns ?? [];
      if (left === undefined || right === undefined || right === 0) {
        return { ok: false };
      }
      return { ok: true, value: left % right };
    }
    case "min":
    case "max": {
      requireArity(op, values, 2, 16);
      const ns = numbers(values);
      if (ns === null) return { ok: false };
      return { ok: true, value: op === "min" ? Math.min(...ns) : Math.max(...ns) };
    }
    case "abs":
    case "floor":
    case "ceil":
    case "round": {
      requireArity(op, values, 1);
      const ns = numbers(values);
      if (ns === null) return { ok: false };
      const [n] = ns;
      if (n === undefined) return { ok: false };
      return {
        ok: true,
        value:
          op === "abs"
            ? Math.abs(n)
            : op === "floor"
              ? Math.floor(n)
              : op === "ceil"
                ? Math.ceil(n)
                : Math.round(n),
      };
    }
    case "concat": {
      requireArity(op, values, 1, 16);
      if (values.some((v) => v === null || v === undefined)) return { ok: false };
      return { ok: true, value: values.map((v) => String(v)).join("") };
    }
    case "lower":
    case "upper":
    case "trim": {
      requireArity(op, values, 1);
      const ss = strings(values);
      if (ss === null) return { ok: false };
      const [s] = ss;
      if (s === undefined) return { ok: false };
      return {
        ok: true,
        value:
          op === "lower"
            ? s.toLowerCase()
            : op === "upper"
              ? s.toUpperCase()
              : s.trim(),
      };
    }
    case "length": {
      requireArity(op, values, 1);
      const [s] = values;
      return typeof s === "string" ? { ok: true, value: s.length } : { ok: false };
    }
    case "contains":
    case "startsWith":
    case "endsWith": {
      requireArity(op, values, 2);
      const ss = strings(values);
      if (ss === null) return { ok: false };
      const [haystack, needle] = ss;
      if (haystack === undefined || needle === undefined) return { ok: false };
      return {
        ok: true,
        value:
          op === "contains"
            ? haystack.includes(needle)
            : op === "startsWith"
              ? haystack.startsWith(needle)
              : haystack.endsWith(needle),
      };
    }
    default:
      throw new Error(`unknown compute operator: ${op}`);
  }
}

export function applyCompute(clause: ComputeClause, binding: Binding): Binding | null {
  const values = clause.args.map((arg) => {
    const resolved = resolveTerm(arg, binding);
    if (resolved.kind !== "const") {
      throw new Error(
        `compute '${clause.op}' has an unbound variable — its input operands must be bound by an earlier clause`,
      );
    }
    return resolved.value;
  });
  const result = computeValue(clause.op, values);
  if (!result.ok) return null;

  if (clause.as === undefined) {
    if (typeof result.value !== "boolean") {
      throw new Error(
        `compute '${clause.op}' has no 'as' output, so it must produce a boolean predicate`,
      );
    }
    return result.value ? binding : null;
  }

  const out = resolveTerm(clause.as, binding);
  if (out.kind === "const") {
    return valueKey(out.value) === valueKey(result.value) ? binding : null;
  }
  return { ...binding, [out.name]: result.value };
}

export function project(
  bindings: Binding[],
  select: string[],
): Record<string, unknown>[] {
  const names = select.map((s) => (s.startsWith("?") ? s.slice(1) : s));
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const b of bindings) {
    const row: Record<string, unknown> = {};
    for (const n of names) row[n] = b[n];
    const key = JSON.stringify(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export function mergeUniqueSources<SourceId extends string>(
  a: SourceId[],
  b: SourceId[],
): SourceId[] {
  if (b.length === 0) return a;
  const set = new Set<SourceId>(a);
  for (const id of b) set.add(id);
  return [...set];
}

export function bindingKey(binding: Binding): string {
  return JSON.stringify(
    Object.entries(binding)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, valueKey(v)]),
  );
}

export function dedupeProvenancedBindings<
  SourceId extends string,
  EventSourceId extends string = string,
>(
  states: ProvenancedBinding<SourceId, EventSourceId>[],
): ProvenancedBinding<SourceId, EventSourceId>[] {
  const byBinding = new Map<string, ProvenancedBinding<SourceId, EventSourceId>>();
  for (const st of states) {
    const key = bindingKey(st.binding);
    const existing = byBinding.get(key);
    if (existing === undefined) {
      byBinding.set(key, st);
    } else {
      byBinding.set(key, {
        binding: existing.binding,
        sources: mergeUniqueSources(existing.sources, st.sources),
        eventSources: mergeUniqueSources(
          existing.eventSources ?? [],
          st.eventSources ?? [],
        ),
      });
    }
  }
  return [...byBinding.values()];
}

export function extendProvenancedBinding<
  SourceId extends string,
  EventSourceId extends string = string,
>(
  clause: PatternClause,
  state: ProvenancedBinding<SourceId, EventSourceId>,
  triple: QueryTriple<SourceId, EventSourceId>,
): ProvenancedBinding<SourceId, EventSourceId> | null {
  const binding = unifyPattern(clause, state.binding, triple);
  if (binding === null) return null;
  return {
    binding,
    sources: mergeUniqueSources(state.sources, triple.prov),
    eventSources: mergeUniqueSources(
      state.eventSources ?? [],
      triple.eventProv ?? [],
    ),
  };
}

export type ResultPage<T> = {
  page: T[];
  isDone: boolean;
  continueCursor: string | null;
};

export function paginateRows<T>(
  rows: T[],
  opts: { numItems: number; cursor?: string | null },
): ResultPage<T> {
  if (!Number.isFinite(opts.numItems) || opts.numItems <= 0) {
    throw new Error("paginationOpts.numItems must be a positive finite number");
  }

  const cursor =
    opts.cursor === undefined || opts.cursor === null ? "" : String(opts.cursor);
  const start = cursor === "" ? 0 : Number.parseInt(cursor, 10);
  if (
    !Number.isInteger(start) ||
    start < 0 ||
    (cursor !== "" && String(start) !== cursor)
  ) {
    throw new Error("invalid pagination cursor");
  }

  const size = Math.max(
    1,
    Math.min(Math.floor(opts.numItems), LIMITS.maxPageSize),
  );
  const end = Math.min(start + size, rows.length);
  return {
    page: rows.slice(start, end),
    isDone: end >= rows.length,
    continueCursor: end >= rows.length ? null : String(end),
  };
}

export type AggOp = "count" | "countDistinct" | "sum" | "avg" | "min" | "max";
export type AggSpec = { op: AggOp; var?: string; as: string };

function stripVar(s: string): string {
  return s.startsWith("?") ? s.slice(1) : s;
}

function computeAgg(op: AggOp, values: unknown[], rowCount: number): unknown {
  switch (op) {
    case "count":
      return values.length === 0
        ? rowCount
        : values.filter((v) => v !== undefined && v !== null).length;
    case "countDistinct":
      return new Set(
        values.filter((v) => v !== undefined && v !== null).map(valueKey),
      ).size;
    case "sum": {
      const nums = values.filter((v): v is number => typeof v === "number");
      return nums.reduce((a, b) => a + b, 0);
    }
    case "avg": {
      const nums = values.filter((v): v is number => typeof v === "number");
      return nums.length === 0
        ? null
        : nums.reduce((a, b) => a + b, 0) / nums.length;
    }
    case "min":
    case "max": {
      const present = values.filter((v) => v !== undefined && v !== null);
      if (present.length === 0) return null;
      const cmp = (a: unknown, b: unknown) =>
        typeof a === "number" && typeof b === "number"
          ? a - b
          : String(a).localeCompare(String(b));
      return present.reduce((acc, v) =>
        op === "min" ? (cmp(v, acc) < 0 ? v : acc) : (cmp(v, acc) > 0 ? v : acc),
      );
    }
  }
}

export function aggregateBindings(
  bindings: Binding[],
  groupBy: string[],
  specs: AggSpec[],
): Record<string, unknown>[] {
  const groupVars = groupBy.map(stripVar);
  const groups = new Map<
    string,
    { key: Record<string, unknown>; rows: Binding[] }
  >();

  for (const b of bindings) {
    const k = JSON.stringify(groupVars.map((g) => valueKey(b[g])));
    let group = groups.get(k);
    if (!group) {
      const key: Record<string, unknown> = {};
      for (const g of groupVars) key[g] = b[g];
      group = { key, rows: [] };
      groups.set(k, group);
    }
    group.rows.push(b);
  }

  const out: Record<string, unknown>[] = [];
  for (const group of groups.values()) {
    const row: Record<string, unknown> = { ...group.key };
    for (const spec of specs) {
      const values = spec.var
        ? group.rows.map((r) => r[stripVar(spec.var!)])
        : [];
      row[spec.as] = computeAgg(spec.op, values, group.rows.length);
    }
    out.push(row);
  }
  return out;
}

export function resolveEmitTerm(term: unknown, binding: Binding): unknown {
  if (typeof term === "string" && term.startsWith("?")) {
    return binding[term.slice(1)];
  }
  return term;
}

export function derivedRowsFromBindings(
  bindings: Binding[],
  emit: EmitSpec,
): DerivedRow[] {
  const byKey = new Map<string, DerivedRow>();
  for (const binding of bindings) {
    const e = resolveEmitTerm(emit.e, binding);
    if (e === undefined || e === null) continue;
    const value = resolveEmitTerm(emit.v, binding);
    const row = { e: String(e), a: emit.a, v: value };
    byKey.set(`${row.e}\u0000${row.a}\u0000${valueKey(row.v)}`, row);
  }
  return [...byKey.values()].sort((a, b) => {
    const e = a.e.localeCompare(b.e);
    if (e !== 0) return e;
    const attr = a.a.localeCompare(b.a);
    if (attr !== 0) return attr;
    return valueKey(a.v).localeCompare(valueKey(b.v));
  });
}

export function describeClauses(where: unknown[]): ClauseDescription[] {
  const fmt = (t: Term) =>
    t.kind === "var" ? `?${t.name}` : JSON.stringify(t.value);
  const describe = (c: AnyClause): ClauseDescription => {
    if (c.kind === "pattern") {
      return { kind: "pattern", e: fmt(c.e), a: fmt(c.a), v: fmt(c.v) };
    }
    if (c.kind === "compare") {
      return {
        kind: "compare",
        left: fmt(c.left),
        op: c.op,
        right: fmt(c.right),
      };
    }
    if (c.kind === "compute") {
      return {
        kind: "compute",
        op: c.op,
        args: c.args.map(fmt),
        ...(c.as === undefined ? {} : { as: fmt(c.as) }),
      };
    }
    if (c.kind === "not") {
      const p = c.pattern;
      return { kind: "not", e: fmt(p.e), a: fmt(p.a), v: fmt(p.v) };
    }
    return {
      kind: "or",
      branches: c.branches.map((branch) => branch.map(describe)),
    };
  };
  return parseClauses(where).map(describe);
}

export function entityVarOf(emitE: string): string | null {
  return emitE.startsWith("?") ? emitE.slice(1) : null;
}

export function isEntityLocalRule(where: unknown[], emitE: string): boolean {
  const ev = entityVarOf(emitE);
  if (ev === null) return false;
  for (const c of parseClauses(where)) {
    const subjects =
      c.kind === "pattern"
        ? [c.e]
        : c.kind === "not"
          ? [c.pattern.e]
          : c.kind === "or"
            ? c.branches.flatMap((branch) =>
                branch.flatMap((branchClause) =>
                  branchClause.kind === "pattern"
                    ? [branchClause.e]
                    : branchClause.kind === "not"
                      ? [branchClause.pattern.e]
                      : [],
                ),
              )
            : [];
    for (const subject of subjects) {
      if (subject.kind === "var" && subject.name !== ev) return false;
    }
  }
  return true;
}
