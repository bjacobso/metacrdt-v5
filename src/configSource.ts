import {
  accountMetadata,
  accountConfigResourceGraph,
  accountConfigResourceGraphToMermaid,
  accountConfigToFormaSource,
  parseFormaAccountConfigSource,
  type AccountConfigResourceGraphEdge,
  type AccountConfigSourceDiagnostic,
} from "@metacrdt/account-config";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export type AccountConfigSourceFormat = "json" | "yaml" | "forma";

export type FormaSnippet = {
  label: string;
  source: string;
};

export type FormaCompletionSuggestion = FormaSnippet & {
  detail: string;
  sourceAware: boolean;
};

export type AccountConfigSourceOutlineItem = {
  name: string;
  detail?: string;
  line?: number;
};

export type AccountConfigSourceOutlineGroup = {
  kind: "account" | "attribute" | "entityType" | "form" | "flow" | "requirement" | "action";
  label: string;
  items: AccountConfigSourceOutlineItem[];
};

export type AccountConfigSourceNavigationItem = {
  key: string;
  label: string;
  line: number;
  detail?: string;
  sourceLine?: string;
};

export type AccountConfigSourceDiffLine = {
  kind: "same" | "added" | "removed";
  text: string;
  oldLine?: number;
  newLine?: number;
};

export type AccountConfigSourceLineDiff = {
  changed: boolean;
  added: number;
  removed: number;
  lines: AccountConfigSourceDiffLine[];
  truncated: boolean;
};

export {
  accountMetadata,
  accountConfigResourceGraph,
  accountConfigResourceGraphToMermaid,
  type AccountConfigResourceGraphEdge,
};

export function accountConfigResourceGraphMermaid(
  config: unknown,
  edges: AccountConfigResourceGraphEdge[] = accountConfigResourceGraph(config),
): string {
  return accountConfigResourceGraphToMermaid(edges, {
    account: accountMetadata(config),
  });
}

export const COMPACT_FORMA_SNIPPETS: FormaSnippet[] = [
  {
    label: "Grouped bundle",
    source: `(account-config
  (attributes
    (attr "case.status" string)
    (attr owner entityRef))
  (entities
    (entity Case ["case.status" owner] "A configured case type."))
  (forms
    (form case_intake "Case Intake" "Collects the intake facts needed to open the case."
      (fields
        (field ready boolean "Ready" (required)))))
  (requirements
    (requires case_intake owner "Requires intake evidence for each owner scope."))
  (flows
    (flow case_review Case "Case review" "Routes a case from intake collection to completion." intake
      (steps
        (collect intake case_intake owner (next done))
        (done))))
  (actions
    (action close_case Case "Close case" "Marks the configured case as closed."
      (asserts
        (assert "case.status" closed)))))
`,
  },
  {
    label: "Entity workflow",
    source: `(entity Case "A configured case type."
  (attr "case.status" string)
  (attr owner entityRef)
  (form case_intake "Case Intake" "Collects the intake facts needed to open the case."
    (field ready boolean "Ready" (required))
    (requires owner "Requires intake evidence for each owner scope."))
  (flow case_review "Case review" "Routes a case from intake collection to completion." intake
    (collect intake case_intake owner (next done))
    (done))
  (action close_case "Close case" "Marks the configured case as closed."
    (assert "case.status" closed)))
`,
  },
  {
    label: "Grouped entity",
    source: `(entity Case "A configured case type."
  (attributes
    (attr "case.status" string)
    (attr owner entityRef))
  (forms
    (form case_intake "Case Intake" "Collects the intake facts needed to open the case."
      (fields
        (field ready boolean "Ready" (required)))))
  (requirements
    (requires case_intake owner "Requires intake evidence for each owner scope."))
  (flows
    (flow case_review "Case review" "Routes a case from intake collection to completion." intake
      (steps
        (collect intake case_intake owner (next done))
        (done))))
  (actions
    (action close_case "Close case" "Marks the configured case as closed."
      (asserts
        (assert "case.status" closed)))))
`,
  },
  {
    label: "Attribute",
    source: `(attr "case.priority" string "Case priority.")
`,
  },
  {
    label: "Form with requirement",
    source: `(form case_intake "Case Intake" "Collects the intake facts needed to open the case."
  (fields
    (field ready boolean "Ready" (required)))
  (requirements
    (requires owner "Requires intake evidence for each owner scope.")))
`,
  },
  {
    label: "Collect flow",
    source: `(flow case_review Case "Case review" "Routes a case from intake collection to completion." intake
  (steps
    (collect intake case_intake owner (next done))
    (done)))
`,
  },
  {
    label: "Action",
    source: `(action assign_owner Case "Assign owner" "Assigns ownership for review routing."
  (field owner string "Owner" (required)))
`,
  },
];

export type ParsedConfigSource =
  | {
      config: unknown;
      format: AccountConfigSourceFormat;
      error: null;
      diagnostics: AccountConfigSourceDiagnostic[];
    }
  | {
      config: null;
      format: null;
      error: string;
      diagnostics: AccountConfigSourceDiagnostic[];
    };

export function accountConfigSourceTextDigest(source: string): string {
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

function sourceLines(source: string): string[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export function accountConfigSourceLineDiff(
  before: string,
  after: string,
  limit = 120,
): AccountConfigSourceLineDiff {
  const left = sourceLines(before);
  const right = sourceLines(after);
  const dp = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0),
  );
  for (let i = left.length - 1; i >= 0; i--) {
    for (let j = right.length - 1; j >= 0; j--) {
      dp[i]![j] = left[i] === right[j]
        ? dp[i + 1]![j + 1]! + 1
        : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const lines: AccountConfigSourceDiffLine[] = [];
  let added = 0;
  let removed = 0;
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) {
      lines.push({
        kind: "same",
        text: left[i]!,
        oldLine: i + 1,
        newLine: j + 1,
      });
      i++;
      j++;
    } else if (j < right.length && (i === left.length || dp[i]![j + 1]! >= dp[i + 1]![j]!)) {
      lines.push({ kind: "added", text: right[j]!, newLine: j + 1 });
      added++;
      j++;
    } else if (i < left.length) {
      lines.push({ kind: "removed", text: left[i]!, oldLine: i + 1 });
      removed++;
      i++;
    }
  }

  const truncated = limit >= 0 && lines.length > limit;
  return {
    changed: added > 0 || removed > 0,
    added,
    removed,
    lines: truncated ? lines.slice(0, limit) : lines,
    truncated,
  };
}

function isConfigObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertConfigObject(value: unknown, format: AccountConfigSourceFormat): unknown {
  if (!isConfigObject(value)) {
    throw new Error(`${format.toUpperCase()} account config must be an object`);
  }
  return value;
}

function section(config: unknown, key: string): Record<string, unknown>[] {
  const value = isConfigObject(config) ? config[key] : undefined;
  return Array.isArray(value) ? value.filter(isConfigObject) : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function arrayCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function detailWithDescription(parts: readonly (string | undefined)[], description: unknown): string | undefined {
  const detail = [
    ...parts,
    stringValue(description),
  ]
    .filter((part): part is string => part !== undefined && part.trim() !== "")
    .join(" / ");
  return detail === "" ? undefined : detail;
}

function quoted(value: string): string {
  return JSON.stringify(value);
}

function ident(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "item";
}

function preferredActionAttribute(attributes: readonly Record<string, unknown>[]): string | undefined {
  const candidates = attributes
    .map((entry) => ({
      name: stringValue(entry.name),
      valueType: stringValue(entry.valueType),
    }))
    .filter((entry): entry is { name: string; valueType: string | undefined } =>
      entry.name !== undefined,
    );
  return [...candidates]
    .sort((left, right) => {
      const rank = (candidate: { name: string; valueType?: string }) => {
        if (candidate.name === "name") return 30;
        if (candidate.valueType === "entityRef") return 20;
        if (candidate.name.endsWith(".status") || candidate.name === "status") return 0;
        return 10;
      };
      return rank(left) - rank(right);
    })[0]?.name;
}

function fieldTypeForAttribute(valueType: string | undefined): string | undefined {
  if (valueType === undefined || valueType === "string") return "string";
  if (valueType === "number" || valueType === "boolean" || valueType === "date") {
    return valueType;
  }
  return undefined;
}

function likelyPiiAttributeName(name: string): boolean {
  return /(^|[./_-])(ssn|social[_ -]?security|tax[_ -]?id|dob|birth|email|phone)([./_-]|$)/i
    .test(name);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
    : [];
}

function formaVector(values: readonly string[]): string {
  return `[${values.map(quoted).join(" ")}]`;
}

function selectOptionsForAttribute(name: string): string[] | undefined {
  if (/citizenship/i.test(name)) return ["citizen", "permanent_resident", "authorized_alien"];
  if (/matter[./_-]?status/i.test(name)) return ["open", "closed"];
  if (/everify[./_-]?status/i.test(name)) return ["pending", "verified", "needs_review"];
  if (/worker[./_-]?status/i.test(name)) return ["active", "terminated"];
  if (/(priority|severity|risk)$/i.test(name)) return ["low", "medium", "high"];
  if (/(stage|state|status)$/i.test(name)) return ["draft", "active", "closed"];
  return undefined;
}

function suggestedDefaultLiteralForAttribute(
  name: string,
  valueType: string | undefined,
): string | number | boolean {
  if (valueType === "number") return 1;
  if (valueType === "boolean") return true;
  if (valueType === "date") return "2026-01-01";
  const options = selectOptionsForAttribute(name);
  if (options?.includes("active")) return "active";
  if (options?.includes("medium")) return "medium";
  return options?.[0] ?? "value";
}

function suggestedAssertionLiteralForAttribute(
  name: string,
  valueType: string | undefined,
): string | number | boolean {
  if (valueType === "number") return 1;
  if (valueType === "boolean") return true;
  if (valueType === "date") return "2026-01-01";
  const options = selectOptionsForAttribute(name);
  if (/everify[./_-]?status/i.test(name) && options?.includes("verified")) return "verified";
  if (options?.includes("active")) return "active";
  if (options?.includes("medium")) return "medium";
  return options?.[0] ?? "value";
}

function collectStepId(form: string, scopeAttr: string, primaryScope: boolean): string {
  const formId = ident(form);
  return primaryScope ? `collect_${formId}` : `collect_${formId}_${ident(scopeAttr)}`;
}

function formatFormaLiteral(value: string | number | boolean): string {
  return typeof value === "string" ? quoted(value) : String(value);
}

function completionLiteralKey(value: unknown): string | undefined {
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  ) {
    return undefined;
  }
  return JSON.stringify(value);
}

function formFieldSourceForAttribute(
  name: string,
  valueType: string | undefined,
): string | undefined {
  const type = fieldTypeForAttribute(valueType);
  if (type === undefined) return undefined;
  const selectOptions = type === "string" ? selectOptionsForAttribute(name) : undefined;
  const piiSuffix = (type === "string" || type === "date") && likelyPiiAttributeName(name)
    ? " (pii)"
    : "";
  if (selectOptions !== undefined) {
    return `(field ${quoted(name)} select ${quoted(humanizeName(name))} ${formaVector(selectOptions)}${piiSuffix})`;
  }
  return `(field ${quoted(name)} ${type} ${quoted(humanizeName(name))}${piiSuffix})`;
}

function uniqueStrings(values: readonly (string | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => value !== undefined))];
}

function humanizeName(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/g)
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === "ssn") return "SSN";
      if (lower === "i9") return "I-9";
      if (lower === "everify") return "E-Verify";
      return `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`;
    })
    .join(" ") || "Value";
}

function compactSnippet(label: string): string {
  const snippet = COMPACT_FORMA_SNIPPETS.find((entry) => entry.label === label);
  if (snippet === undefined) throw new Error(`missing Forma snippet: ${label}`);
  return snippet.source;
}

function sourceLineFor(source: string | undefined, candidates: readonly string[]): number | undefined {
  if (source === undefined) return undefined;
  const lines = source.split("\n");
  const index = lines.findIndex((line) =>
    candidates.some((candidate) => line.includes(candidate)),
  );
  return index === -1 ? undefined : index + 1;
}

function indentation(line: string): number {
  const match = /^\s*/.exec(line);
  return match?.[0].length ?? 0;
}

function tokenCandidates(value: string): string[] {
  const jsonValue = quoted(value);
  return jsonValue === value ? [value] : [jsonValue, value];
}

function accountLine(source: string | undefined): number | undefined {
  return sourceLineFor(source, [
    "(tenant ",
    "(account ",
    '"account"',
    "account:",
  ]);
}

function requirementLine(
  source: string | undefined,
  requirement: Record<string, unknown>,
): number | undefined {
  const formName = stringValue(requirement.form);
  if (source === undefined || formName === undefined) return undefined;
  const jsonName = quoted(formName);
  const scopeName = stringValue(requirement.scopeAttr);
  const formTokens = tokenCandidates(formName);
  const scopeTokens = scopeName === undefined ? [] : tokenCandidates(scopeName);
  const scopedCandidates = formTokens.flatMap((formToken) =>
    scopeTokens.flatMap((scopeToken) => [
      `(requirement ${formToken} ${scopeToken}`,
      `(requirement ${formToken} (scope ${scopeToken}`,
      `(requirement ${formToken} (scope-attr ${scopeToken}`,
      `(requires ${formToken} ${scopeToken}`,
      `(requires ${formToken} (scope ${scopeToken}`,
      `(requires ${formToken} (scope-attr ${scopeToken}`,
    ]),
  );
  const direct = sourceLineFor(source, [
    ...(scopeTokens.length > 0
      ? scopedCandidates
      : [
          ...formTokens.flatMap((formToken) => [
            `(requirement ${formToken}`,
            `(requires ${formToken}`,
          ]),
          `"form": ${jsonName}`,
          `form: ${formName}`,
        ]),
  ]);
  if (direct !== undefined) return direct;

  const lines = source.split("\n");
  const formIndex = lines.findIndex((line) =>
    formTokens.some((formToken) => line.includes(`(form ${formToken}`)),
  );
  if (formIndex === -1) return undefined;

  const formIndent = indentation(lines[formIndex]!);
  for (let index = formIndex + 1; index < lines.length; index++) {
    const line = lines[index]!;
    const trimmed = line.trimStart();
    if (trimmed === "") continue;
    if (indentation(line) <= formIndent) return undefined;
    if (
      scopeTokens.length > 0 &&
      scopeTokens.some((scopeToken) =>
        trimmed.startsWith(`(requires ${scopeToken}`) ||
        trimmed.startsWith(`(requires (scope ${scopeToken}`) ||
        trimmed.startsWith(`(requires (scope-attr ${scopeToken}`) ||
        trimmed.startsWith(`(requirement ${scopeToken}`) ||
        trimmed.startsWith(`(requirement (scope ${scopeToken}`) ||
        trimmed.startsWith(`(requirement (scope-attr ${scopeToken}`),
      )
    ) {
      return index + 1;
    }
    if (
      scopeTokens.length === 0 &&
      (trimmed.startsWith("(requires ") || trimmed.startsWith("(requirement "))
    ) {
      return index + 1;
    }
  }
  return undefined;
}

function resourceLine(
  source: string | undefined,
  kind: AccountConfigSourceOutlineGroup["kind"],
  name: string,
): number | undefined {
  const rawName = name === "<unnamed>" ? "" : name;
  if (rawName === "") return undefined;
  const jsonName = quoted(rawName);
  if (kind === "attribute") {
    return sourceLineFor(source, [
      `(attribute ${jsonName}`,
      `(attribute ${rawName}`,
      `(attr ${jsonName}`,
      `(attr ${rawName}`,
      `"name": ${jsonName}`,
      `name: ${rawName}`,
    ]);
  }
  if (kind === "entityType") {
    return sourceLineFor(source, [
      `(entity-type ${jsonName}`,
      `(entity-type ${rawName}`,
      `(entity ${jsonName}`,
      `(entity ${rawName}`,
      `"name": ${jsonName}`,
      `name: ${rawName}`,
    ]);
  }
  if (kind === "form") {
    return sourceLineFor(source, [
      `(form ${jsonName}`,
      `(form ${rawName}`,
      `"form": ${jsonName}`,
      `form: ${rawName}`,
    ]);
  }
  return sourceLineFor(source, [
    `(${kind} ${jsonName}`,
    `(${kind} ${rawName}`,
    `"name": ${jsonName}`,
    `name: ${rawName}`,
  ]);
}

export function accountConfigSourceOutline(
  config: unknown,
  source?: string,
): AccountConfigSourceOutlineGroup[] {
  const account = isConfigObject(config) && isConfigObject(config.account)
    ? [
        {
          name:
            stringValue(config.account.slug) ??
            stringValue(config.account.name) ??
            "<account>",
          detail: detailWithDescription([
            stringValue(config.account.name),
            stringValue(config.account.kind),
          ], undefined),
          line: accountLine(source),
        },
      ]
    : [];
  const attributes = section(config, "attributes").map((entry) => {
    const name = stringValue(entry.name) ?? "<unnamed>";
    return {
      name,
      detail: detailWithDescription([
        stringValue(entry.valueType),
        stringValue(entry.cardinality),
      ], entry.description),
      line: resourceLine(source, "attribute", name),
    };
  });
  const entityTypes = section(config, "entityTypes").map((entry) => {
    const name = stringValue(entry.name) ?? "<unnamed>";
    return {
      name,
      detail: detailWithDescription(
        [plural(arrayCount(entry.attributes), "attribute")],
        entry.description,
      ),
      line: resourceLine(source, "entityType", name),
    };
  });
  const forms = section(config, "forms").map((entry) => {
    const name = stringValue(entry.form) ?? "<unnamed>";
    return {
      name,
      detail: detailWithDescription(
        [plural(arrayCount(entry.fields), "field")],
        entry.description,
      ),
      line: resourceLine(source, "form", name),
    };
  });
  const flows = section(config, "flows").map((entry) => {
    const name = stringValue(entry.name) ?? "<unnamed>";
    return {
      name,
      detail: detailWithDescription([
        stringValue(entry.subjectType),
        plural(arrayCount(entry.steps), "step"),
      ], entry.description),
      line: resourceLine(source, "flow", name),
    };
  });
  const requirements = section(config, "requirements").map((entry) => {
    const name = stringValue(entry.form) ?? "<unnamed>";
    return {
      name,
      detail: detailWithDescription(
        stringValue(entry.scopeAttr) === undefined
          ? []
          : [`scope ${stringValue(entry.scopeAttr)}`],
        entry.description,
      ),
      line: requirementLine(source, entry),
    };
  });
  const actions = section(config, "actions").map((entry) => {
    const name = stringValue(entry.name) ?? "<unnamed>";
    return {
      name,
      detail: detailWithDescription(
        stringValue(entry.appliesTo) === undefined
          ? []
          : [`on ${stringValue(entry.appliesTo)}`],
        entry.description,
      ),
      line: resourceLine(source, "action", name),
    };
  });

  return [
    { kind: "account", label: "Account", items: account },
    { kind: "attribute", label: "Attributes", items: attributes },
    { kind: "entityType", label: "Types", items: entityTypes },
    { kind: "form", label: "Forms", items: forms },
    { kind: "flow", label: "Flows", items: flows },
    { kind: "requirement", label: "Requirements", items: requirements },
    { kind: "action", label: "Actions", items: actions },
  ];
}

export function accountConfigSourceNavigationItems(
  outline: readonly AccountConfigSourceOutlineGroup[],
  source?: string,
): AccountConfigSourceNavigationItem[] {
  const sourceLines = source?.split("\n");
  return outline.flatMap((group) =>
    group.items
      .filter((item): item is AccountConfigSourceOutlineItem & { line: number } =>
        item.line !== undefined,
      )
      .map((item) => {
        const sourceLine = sourceLines?.[item.line - 1]?.trim();
        return {
          key: `${group.kind}:${item.name}:${item.line}`,
          label: `${group.label}: ${item.name}`,
          line: item.line,
          ...(item.detail === undefined ? {} : { detail: item.detail }),
          ...(sourceLine === undefined || sourceLine === "" ? {} : { sourceLine }),
        };
      }),
  );
}

export function formaCompletionSuggestions(
  config: unknown,
): FormaCompletionSuggestion[] {
  const attributeRows = section(config, "attributes");
  const attributes = attributeRows
    .map((entry) => stringValue(entry.name))
    .filter((name): name is string => name !== undefined);
  const attributeValueTypes = new Map(
    attributeRows
      .map((entry) => [stringValue(entry.name), stringValue(entry.valueType)] as const)
      .filter((entry): entry is readonly [string, string | undefined] =>
        entry[0] !== undefined,
      ),
  );
  const entityTypeRows = section(config, "entityTypes");
  const entityTypes = entityTypeRows
    .map((entry) => stringValue(entry.name))
    .filter((name): name is string => name !== undefined);
  const forms = section(config, "forms")
    .map((entry) => stringValue(entry.form))
    .filter((name): name is string => name !== undefined);
  const formNames = new Set(forms);
  const flowNames = new Set(
    section(config, "flows")
      .map((entry) => stringValue(entry.name))
      .filter((name): name is string => name !== undefined),
  );
  const flowStepIds = new Set(
    section(config, "flows")
      .flatMap((entry) => Array.isArray(entry.steps) ? entry.steps : [])
      .map((entry) => isConfigObject(entry) ? stringValue(entry.id) : undefined)
      .filter((name): name is string => name !== undefined),
  );
  const existingCollectSteps = new Set(
    section(config, "flows")
      .flatMap((entry) => Array.isArray(entry.steps) ? entry.steps : [])
      .filter(isConfigObject)
      .map((step) => {
        const config = isConfigObject(step.config) ? step.config : undefined;
        const form = stringValue(config?.form);
        const scopeFrom = stringValue(config?.scopeFrom);
        return form !== undefined && scopeFrom !== undefined
          ? `${form}\u0000${scopeFrom}`
          : undefined;
      })
      .filter((key): key is string => key !== undefined),
  );
  const existingNotifySteps = new Set(
    section(config, "flows")
      .flatMap((entry) => Array.isArray(entry.steps) ? entry.steps : [])
      .filter(isConfigObject)
      .map((step) => {
        const config = isConfigObject(step.config) ? step.config : undefined;
        const channel = stringValue(config?.channel);
        const to = stringValue(config?.to);
        const template = stringValue(config?.template);
        return channel !== undefined && to !== undefined && template !== undefined
          ? `${channel}\u0000${to}\u0000${template}`
          : undefined;
      })
      .filter((key): key is string => key !== undefined),
  );
  const existingBranchConditions = new Set(
    section(config, "flows")
      .flatMap((entry) => Array.isArray(entry.steps) ? entry.steps : [])
      .filter(isConfigObject)
      .flatMap((step) => {
        const config = isConfigObject(step.config) ? step.config : undefined;
        const where = Array.isArray(config?.where) ? config.where : [];
        return where
          .filter(Array.isArray)
          .map((clause) => {
            const attr = typeof clause[1] === "string" ? clause[1] : undefined;
            const value = completionLiteralKey(clause[2]);
            return attr !== undefined && value !== undefined
              ? `${attr}\u0000${value}`
              : undefined;
          })
          .filter((key): key is string => key !== undefined);
      }),
  );
  const existingWaitDurations = new Set(
    section(config, "flows")
      .flatMap((entry) => Array.isArray(entry.steps) ? entry.steps : [])
      .filter(isConfigObject)
      .map((step) => {
        const config = isConfigObject(step.config) ? step.config : undefined;
        const seconds = typeof config?.seconds === "number"
          ? config.seconds
          : typeof config?.delaySeconds === "number"
            ? config.delaySeconds
            : undefined;
        return seconds === undefined ? undefined : String(seconds);
      })
      .filter((key): key is string => key !== undefined),
  );
  const hasDoneStep = section(config, "flows")
    .flatMap((entry) => Array.isArray(entry.steps) ? entry.steps : [])
    .filter(isConfigObject)
    .some((step) => stringValue(step.id) === "done" || stringValue(step.type) === "done");
  const existingCollectFlows = new Set(
    section(config, "flows")
      .flatMap((flow) => {
        const subjectType = stringValue(flow.subjectType);
        const steps = Array.isArray(flow.steps) ? flow.steps : [];
        if (subjectType === undefined) return [];
        return steps
          .filter(isConfigObject)
          .map((step) => {
            const config = isConfigObject(step.config) ? step.config : undefined;
            const form = stringValue(config?.form);
            const scopeFrom = stringValue(config?.scopeFrom);
            return form !== undefined && scopeFrom !== undefined
              ? `${subjectType}\u0000${form}\u0000${scopeFrom}`
              : undefined;
          })
          .filter((key): key is string => key !== undefined);
      }),
  );
  const actionNames = new Set(
    section(config, "actions")
      .map((entry) => stringValue(entry.name))
      .filter((name): name is string => name !== undefined),
  );
  const existingOpenFormActions = new Set(
    section(config, "actions")
      .map((entry) => {
        const appliesTo = stringValue(entry.appliesTo);
        const opensForm = isConfigObject(entry.opensForm) ? entry.opensForm : undefined;
        const form = stringValue(opensForm?.form);
        const scope = stringValue(opensForm?.scope);
        return appliesTo !== undefined && form !== undefined && scope !== undefined
          ? `${appliesTo}\u0000${form}\u0000${scope}`
          : undefined;
      })
      .filter((key): key is string => key !== undefined),
  );
  const requiredForms = new Set(
    section(config, "requirements")
      .map((entry) => stringValue(entry.form))
      .filter((name): name is string => name !== undefined),
  );
  const formScopes = new Map<string, string[]>();
  for (const requirement of section(config, "requirements")) {
    const form = stringValue(requirement.form);
    const scope = stringValue(requirement.scopeAttr);
    if (form === undefined || scope === undefined) continue;
    formScopes.set(form, uniqueStrings([...(formScopes.get(form) ?? []), scope]));
  }
  const entityRefAttributes = section(config, "attributes")
    .filter((entry) => entry.valueType === "entityRef")
    .map((entry) => stringValue(entry.name))
    .filter((name): name is string => name !== undefined);

  const suggestions: FormaCompletionSuggestion[] = [
    {
      label: "New grouped bundle",
      detail: "Account bundle with plural grouping wrappers for larger tenant files.",
      sourceAware: false,
      source: compactSnippet("Grouped bundle"),
    },
    {
      label: "New entity",
      detail: "Compact entity with attribute, form, flow, requirement, and action.",
      sourceAware: false,
      source: compactSnippet("Entity workflow"),
    },
    {
      label: "New grouped entity",
      detail: "Compact entity organized with grouped child wrappers.",
      sourceAware: false,
      source: compactSnippet("Grouped entity"),
    },
    {
      label: "New attribute",
      detail: "Standalone attribute definition.",
      sourceAware: false,
      source: compactSnippet("Attribute"),
    },
    {
      label: "New form",
      detail: "Form with fields and an inline requirement.",
      sourceAware: false,
      source: compactSnippet("Form with requirement"),
    },
    {
      label: "New flow",
      detail: "Collect-and-complete workflow.",
      sourceAware: false,
      source: compactSnippet("Collect flow"),
    },
    {
      label: "New action",
      detail: "Standalone action definition.",
      sourceAware: false,
      source: compactSnippet("Action"),
    },
  ];

  for (const entry of attributeRows.slice(0, 8)) {
    const name = stringValue(entry.name);
    if (name === undefined || name === "type") continue;
    const type = fieldTypeForAttribute(stringValue(entry.valueType));
    if (type === undefined) continue;
    suggestions.push({
      label: `Field for ${name}`,
      detail: `Nested form/action field using the ${name} attribute name.`,
      sourceAware: true,
      source: `(field ${quoted(name)} ${type} ${quoted(humanizeName(name))})\n`,
    });
    if (type === "string" || type === "number" || type === "date") {
      suggestions.push({
        label: `Required ${type} field for ${name}`,
        detail: `Nested required ${type} field using the ${name} attribute name.`,
        sourceAware: true,
        source: `(field ${quoted(name)} ${type} ${quoted(humanizeName(name))} (required))\n`,
      });
    }
    if ((type === "string" || type === "date") && likelyPiiAttributeName(name)) {
      suggestions.push({
        label: `PII ${type} field for ${name}`,
        detail: `Nested ${type} form field marked as PII for ${name}.`,
        sourceAware: true,
        source: `(field ${quoted(name)} ${type} ${quoted(humanizeName(name))} (pii))\n`,
      });
      suggestions.push({
        label: `Required PII ${type} field for ${name}`,
        detail: `Nested required ${type} form field marked as PII for ${name}.`,
        sourceAware: true,
        source: `(field ${quoted(name)} ${type} ${quoted(humanizeName(name))} (required) (pii))\n`,
      });
    }
    if (type === "number" || type === "boolean" || type === "date") {
      const defaultValue = suggestedDefaultLiteralForAttribute(name, stringValue(entry.valueType));
      suggestions.push({
        label: `Default ${type} field for ${name}`,
        detail: `Nested ${type} field for ${name} with a type-correct default value.`,
        sourceAware: true,
        source: `(field ${quoted(name)} ${type} ${quoted(humanizeName(name))} (default-value ${formatFormaLiteral(defaultValue)}))\n`,
      });
    }
    const selectOptions = type === "string" ? selectOptionsForAttribute(name) : undefined;
    if (selectOptions !== undefined) {
      suggestions.push({
        label: `Select field for ${name}`,
        detail: `Nested select field with reviewable options for ${name}.`,
        sourceAware: true,
        source: `(field ${quoted(name)} select ${quoted(humanizeName(name))} ${formaVector(selectOptions)})\n`,
      });
      suggestions.push({
        label: `Required select field for ${name}`,
        detail: `Nested required select field with reviewable options for ${name}.`,
        sourceAware: true,
        source: `(field ${quoted(name)} select ${quoted(humanizeName(name))} ${formaVector(selectOptions)} (required))\n`,
      });
      suggestions.push({
        label: `Default select field for ${name}`,
        detail: `Nested select field for ${name} with a reviewable default value.`,
        sourceAware: true,
        source: `(field ${quoted(name)} select ${quoted(humanizeName(name))} ${formaVector(selectOptions)} (default-value ${quoted(String(suggestedDefaultLiteralForAttribute(name, stringValue(entry.valueType))))}))\n`,
      });
    }
    if (type === "boolean") {
      suggestions.push({
        label: `Required boolean field for ${name}`,
        detail: `Nested required checkbox field using the ${name} attribute name.`,
        sourceAware: true,
        source: `(field ${quoted(name)} boolean ${quoted(humanizeName(name))} (required))\n`,
      });
    }
  }

  let generatedEntityFormCount = 0;
  for (const entity of entityTypeRows) {
    if (generatedEntityFormCount >= 6) break;
    const entityName = stringValue(entity.name);
    if (entityName === undefined) continue;
    const generatedFormName = `${ident(entityName)}_review`;
    if (formNames.has(generatedFormName)) continue;
    const entityAttributeNames = uniqueStrings(stringArray(entity.attributes));
    const entityScopeAttr = entityAttributeNames.find(
      (name) => attributeValueTypes.get(name) === "entityRef",
    );
    const fieldLines = entityAttributeNames
      .map((name) => formFieldSourceForAttribute(name, attributeValueTypes.get(name)))
      .filter((line): line is string => line !== undefined)
      .slice(0, 8);
    if (fieldLines.length === 0) continue;
    const requirementBlock = entityScopeAttr === undefined
      ? ""
      : `
  (requirements
    (requires ${quoted(entityScopeAttr)} "Requires ${humanizeName(entityName)} review evidence for each ${humanizeName(entityScopeAttr)} scope."))`;
    suggestions.push({
      label: `Form for ${entityName}`,
      detail: entityScopeAttr === undefined
        ? `Drafts a ${entityName} review form from ${plural(fieldLines.length, "compatible attribute")}.`
        : `Drafts a ${entityName} review form scoped by ${entityScopeAttr}.`,
      sourceAware: true,
      source: `(form ${generatedFormName} "Review ${humanizeName(entityName)}" "Collects ${humanizeName(entityName)} review fields."
  (fields
${fieldLines.map((line) => `    ${line}`).join("\n")})${requirementBlock})
`,
    });
    generatedEntityFormCount++;
  }

  const scopeAttrs = uniqueStrings([
    ...entityRefAttributes,
    ...(entityRefAttributes.length === 0 ? [attributes[0]] : []),
  ]).slice(0, 4);
  const scopeAttr = scopeAttrs[0];
  const guardAttr = attributes.find((name) => name !== scopeAttr);
  const notifyAttr =
    entityRefAttributes.find((name) => /attorney|owner|email|contact/i.test(name)) ??
    entityRefAttributes[0];
  const unrequiredForms = forms.filter((name) => !requiredForms.has(name)).slice(0, 4);
  if (scopeAttrs.length > 0) {
    for (const unrequiredForm of unrequiredForms) {
      for (const candidateScopeAttr of scopeAttrs) {
        const primaryScope = candidateScopeAttr === scopeAttr;
        suggestions.push({
          label: primaryScope
            ? `Requirement for ${unrequiredForm}`
            : `Requirement for ${unrequiredForm} scoped to ${candidateScopeAttr}`,
          detail: `Uses ${candidateScopeAttr} as the reusable evidence scope.`,
          sourceAware: true,
          source: `(requires ${quoted(unrequiredForm)} ${quoted(candidateScopeAttr)})\n`,
        });
        if (guardAttr !== undefined) {
          const guardValue = suggestedAssertionLiteralForAttribute(
            guardAttr,
            attributeValueTypes.get(guardAttr),
          );
          const guardLiteral = formatFormaLiteral(guardValue);
          suggestions.push({
            label: primaryScope
              ? `Guarded requirement for ${unrequiredForm}`
              : `Guarded requirement for ${unrequiredForm} scoped to ${candidateScopeAttr}`,
            detail: `Applies ${unrequiredForm} only when ${guardAttr} matches ${guardValue}.`,
            sourceAware: true,
            source: `(requires ${quoted(unrequiredForm)} ${quoted(candidateScopeAttr)} (when ${quoted(guardAttr)} ${guardLiteral}))\n`,
          });
        }
      }
    }
  }
  if (scopeAttrs.length > 0) {
    for (const form of forms.slice(0, 4)) {
      for (const candidateScopeAttr of scopeAttrs) {
        const primaryScope = candidateScopeAttr === scopeAttr;
        const stepId = collectStepId(form, candidateScopeAttr, primaryScope);
        if (
          flowStepIds.has(stepId) ||
          existingCollectSteps.has(`${form}\u0000${candidateScopeAttr}`)
        ) {
          continue;
        }
        suggestions.push({
          label: primaryScope
            ? `Collect ${form} step`
            : `Collect ${form} step scoped to ${candidateScopeAttr}`,
          detail: `Workflow step scoped from ${candidateScopeAttr}.`,
          sourceAware: true,
          source: `(step ${stepId} (collect ${quoted(form)} ${quoted(candidateScopeAttr)}) done)
`,
        });
      }
    }
  }

  const attr = preferredActionAttribute(attributeRows);
  const attrValue = attr === undefined
    ? undefined
    : suggestedAssertionLiteralForAttribute(attr, attributeValueTypes.get(attr));
  const attrLiteral = attrValue === undefined ? undefined : formatFormaLiteral(attrValue);
  const generatedNotifyId =
    notifyAttr === undefined ? undefined : `notify_${ident(notifyAttr)}`;
  if (
    notifyAttr !== undefined &&
    generatedNotifyId !== undefined &&
    !flowStepIds.has(generatedNotifyId) &&
    !existingNotifySteps.has(`email\u0000$arg.${notifyAttr}\u0000notification-sent`)
  ) {
    suggestions.push({
      label: `Notify ${notifyAttr} step`,
      detail: `Sends an email notification to ${notifyAttr}.`,
      sourceAware: true,
      source: `(notify ${generatedNotifyId} "Notification sent" email "$arg.${notifyAttr}" "notification-sent" (next done))
`,
    });
  }
  const generatedDelayId = "delay_review";
  const generatedDelaySeconds = 300;
  if (
    !flowStepIds.has(generatedDelayId) &&
    !existingWaitDurations.has(String(generatedDelaySeconds))
  ) {
    suggestions.push({
      label: "Delay review step",
      detail: "Pauses a workflow before continuing to done.",
      sourceAware: true,
      source: `(delay ${generatedDelayId} ${generatedDelaySeconds} (next done))
`,
    });
  }
  if (!hasDoneStep && !flowStepIds.has("done")) {
    suggestions.push({
      label: "Done step",
      detail: "Terminal workflow step for compact flow authoring.",
      sourceAware: true,
      source: "(done)\n",
    });
  }
  const generatedBranchRouteId = attr === undefined ? undefined : `route_${ident(attr)}`;
  const generatedBranchActionId = attr === undefined ? undefined : `set_${ident(attr)}`;
  if (
    attr !== undefined &&
    attrValue !== undefined &&
    attrLiteral !== undefined &&
    generatedBranchRouteId !== undefined &&
    generatedBranchActionId !== undefined &&
    !flowStepIds.has(generatedBranchRouteId) &&
    !flowStepIds.has(generatedBranchActionId) &&
    !existingBranchConditions.has(`${attr}\u0000${completionLiteralKey(attrValue)}`)
  ) {
    suggestions.push({
      label: `Branch on ${attr} step`,
      detail: `Routes a workflow by ${attr} and sets the same attribute before done.`,
      sourceAware: true,
      source: `(branch ${generatedBranchRouteId} [["?s" ${quoted(attr)} ${attrLiteral}]] ${generatedBranchActionId} done)
(action ${generatedBranchActionId} "Set ${attr}" ${quoted(attr)} ${attrLiteral} (next done))
`,
    });
  }
  const existingActionTargetsForAttrValue = new Set(
    attr === undefined
      ? []
      : section(config, "actions")
          .map((entry) => {
            const appliesTo = stringValue(entry.appliesTo);
            const asserts = entry.asserts;
            if (
              appliesTo === undefined ||
              !isConfigObject(asserts) ||
              !Object.prototype.hasOwnProperty.call(asserts, attr)
            ) {
              return undefined;
            }
            const value = completionLiteralKey(asserts[attr]);
            return value === undefined ? undefined : `${appliesTo}\u0000${attr}\u0000${value}`;
          })
          .filter((key): key is string => key !== undefined),
  );
  let generatedFlowCount = 0;
  if (scopeAttr !== undefined) {
    for (const entityType of entityTypes) {
      for (const form of forms) {
        if (generatedFlowCount >= 6) break;
        const candidateScopes = uniqueStrings([
          ...(formScopes.get(form) ?? []),
          ...scopeAttrs,
        ]).slice(0, 4);
        for (const candidateScopeAttr of candidateScopes) {
          if (generatedFlowCount >= 6) break;
          const primaryScope = candidateScopeAttr === scopeAttr;
          const generatedFlowName = primaryScope
            ? `${ident(entityType)}_${ident(form)}`
            : `${ident(entityType)}_${ident(form)}_${ident(candidateScopeAttr)}`;
          if (
            flowNames.has(generatedFlowName) ||
            existingCollectFlows.has(`${entityType}\u0000${form}\u0000${candidateScopeAttr}`)
          ) {
            continue;
          }
          const stepId = collectStepId(form, candidateScopeAttr, primaryScope);
          suggestions.push({
            label: primaryScope
              ? `Flow for ${entityType} collecting ${form}`
              : `Flow for ${entityType} collecting ${form} scoped to ${candidateScopeAttr}`,
            detail: `Starts by collecting ${form} for ${candidateScopeAttr}.`,
            sourceAware: true,
            source: `(flow ${generatedFlowName} ${quoted(entityType)} "Review ${entityType}" "Collect ${form} before review." ${stepId}
  (step ${stepId} (collect ${quoted(form)} ${quoted(candidateScopeAttr)}) done)
  (step done (done)))
`,
          });
          generatedFlowCount++;
        }
      }
    }
  }
  let generatedOpenFormActionCount = 0;
  if (scopeAttr !== undefined) {
    for (const entityType of entityTypes) {
      for (const form of forms) {
        if (generatedOpenFormActionCount >= 6) break;
        const candidateScopes = uniqueStrings([
          ...(formScopes.get(form) ?? []),
          ...scopeAttrs,
        ]).slice(0, 4);
        for (const candidateScopeAttr of candidateScopes) {
          if (generatedOpenFormActionCount >= 6) break;
          const primaryScope = candidateScopeAttr === scopeAttr;
          const baseActionName = primaryScope
            ? `open_${ident(form)}`
            : `open_${ident(form)}_${ident(candidateScopeAttr)}`;
          const actionName = entityType === entityTypes[0]
            ? baseActionName
            : primaryScope
              ? `open_${ident(entityType)}_${ident(form)}`
              : `open_${ident(entityType)}_${ident(form)}_${ident(candidateScopeAttr)}`;
          if (
            actionNames.has(actionName) ||
            existingOpenFormActions.has(`${entityType}\u0000${form}\u0000${candidateScopeAttr}`)
          ) {
            continue;
          }
          suggestions.push({
            label: primaryScope
              ? `Open ${form} action for ${entityType}`
              : `Open ${form} action for ${entityType} scoped to ${candidateScopeAttr}`,
            detail: `Action on ${entityType} opens ${form} scoped by ${candidateScopeAttr}.`,
            sourceAware: true,
            source: `(action ${actionName} ${quoted(entityType)} "Open ${humanizeName(form)}"
  (opens-form ${quoted(form)} ${quoted(candidateScopeAttr)}))
`,
          });
          generatedOpenFormActionCount++;
        }
      }
    }
  }
  const generatedActionName = attr === undefined ? undefined : `set_${ident(attr)}`;
  if (
    attr !== undefined &&
    attrValue !== undefined &&
    attrLiteral !== undefined &&
    generatedActionName !== undefined &&
    !actionNames.has(generatedActionName)
  ) {
    for (const entityType of entityTypes.slice(0, 4)) {
      if (
        existingActionTargetsForAttrValue.has(
          `${entityType}\u0000${attr}\u0000${completionLiteralKey(attrValue)}`,
        )
      ) {
        continue;
      }
      const actionName = entityType === entityTypes[0]
        ? generatedActionName
        : `set_${ident(entityType)}_${ident(attr)}`;
      if (actionNames.has(actionName)) continue;
      suggestions.push({
        label: `Action on ${entityType} setting ${attr}=${String(attrValue)}`,
        detail: `Asserts ${attr} on ${entityType}.`,
        sourceAware: true,
        source: `(action ${actionName} ${quoted(entityType)} "Set ${attr}"
  (assert ${quoted(attr)} ${attrLiteral}))
`,
      });
    }
  }

  return suggestions;
}

export function parseAccountConfigSource(text: string): ParsedConfigSource {
  const trimmed = text.trimStart();
  const errors: string[] = [];

  try {
    return {
      config: assertConfigObject(JSON.parse(text), "json"),
      format: "json",
      error: null,
      diagnostics: [],
    };
  } catch (jsonError) {
    errors.push(`JSON: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`);
  }

  if (trimmed.startsWith("(")) {
    const parsedForma = parseFormaAccountConfigSource(text);
    if (parsedForma.config !== null) {
      return {
        config: parsedForma.config,
        format: "forma",
        error: null,
        diagnostics: parsedForma.diagnostics,
      };
    }
    errors.push(
      `Forma: ${parsedForma.diagnostics.map((entry) => entry.message).join("; ")}`,
    );
  }

  try {
    return {
      config: assertConfigObject(parseYaml(text), "yaml"),
      format: "yaml",
      error: null,
      diagnostics: [],
    };
  } catch (yamlError) {
    errors.push(`YAML: ${yamlError instanceof Error ? yamlError.message : String(yamlError)}`);
    return {
      config: null,
      format: null,
      error: errors.join("\n"),
      diagnostics: errors.map((message) => ({ message })),
    };
  }
}

export function formatAccountConfigSource(
  config: unknown,
  format: AccountConfigSourceFormat,
): string {
  if (format === "json") return `${JSON.stringify(config, null, 2)}\n`;
  if (format === "yaml") return stringifyYaml(config);
  return accountConfigToFormaSource(config);
}

export function compactFormaStarter(metadata: {
  slug?: string | null;
  name?: string | null;
  kind?: string | null;
} = {}): string {
  const slug = metadata.slug ?? "legal-workflows";
  const name = metadata.name ?? "Legal Workflows";
  const kind = metadata.kind ?? "legal";
  return `(tenant ${JSON.stringify(slug)} ${JSON.stringify(name)} ${JSON.stringify(kind)})
(entity Matter "A legal matter."
  (attributes
    (attr "matter.status" string "Current matter lifecycle state.")
    (attr client entityRef "Client associated with the matter.")
    (attr name))
  (forms
    (form conflict_check "Conflict Check" "Collects conflict clearance evidence for the matter."
      (fields
        (field cleared boolean "Conflict cleared" (required)))
      (requirements
        (requires client "Requires a client-scoped conflict check."))))
  (flows
    (flow matter_intake "Matter intake" "Moves a matter from conflict clearance to open status." conflict
      (steps
        (collect conflict conflict_check client (next open))
        (assert open "matter.status" open (next done))
        (done))))
  (actions
    (action close_matter "Close matter" "Records the matter close decision."
      (opens-form conflict_check client)
      (asserts
        (assert "matter.status" closed)))))
`;
}
