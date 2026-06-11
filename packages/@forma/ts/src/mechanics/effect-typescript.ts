import type { JsonValue, PackageableDeclaration } from "../artifact/artifact.js";

export interface MechanicsEffectTypeScriptModule {
  readonly code: string;
  readonly operationNames: readonly string[];
}

interface EffectDefPayload {
  readonly kind: "EffectDef";
  readonly name: string;
  readonly params: readonly JsonValue[];
  readonly effect: JsonValue;
  readonly body: JsonValue;
}

interface ServiceDefPayload {
  readonly kind: "ServiceDef";
  readonly name: string;
  readonly methods: readonly JsonValue[];
}

export function generateMechanicsEffectTypeScriptModule(
  declarations: readonly PackageableDeclaration[],
): MechanicsEffectTypeScriptModule {
  const services = declarations
    .map((declaration) => servicePayload(declaration.payload))
    .filter((payload): payload is ServiceDefPayload => payload !== undefined);
  const effects = declarations
    .map((declaration) => effectPayload(declaration.payload))
    .filter((payload): payload is EffectDefPayload => payload !== undefined);

  const lines = ['import { Context, Effect } from "effect";', ""];

  for (const service of services) {
    lines.push(...serviceClassLines(service));
    lines.push("");
  }

  for (const effect of effects) {
    lines.push(...operationLines(effect));
    lines.push("");
  }

  return {
    code: lines.join("\n").trimEnd() + "\n",
    operationNames: effects.map((effect) => effect.name),
  };
}

function servicePayload(payload: PackageableDeclaration["payload"]): ServiceDefPayload | undefined {
  if (!isRecord(payload) || payload["kind"] !== "ServiceDef") return undefined;
  const name = payload["name"];
  const methods = payload["methods"];
  if (typeof name !== "string" || !Array.isArray(methods)) return undefined;
  return { kind: "ServiceDef", name, methods };
}

function effectPayload(payload: PackageableDeclaration["payload"]): EffectDefPayload | undefined {
  if (!isRecord(payload) || payload["kind"] !== "EffectDef") return undefined;
  const name = payload["name"];
  const params = payload["params"];
  const effect = payload["effect"];
  const body = payload["body"];
  if (typeof name !== "string" || !Array.isArray(params) || effect === undefined || body === undefined) {
    return undefined;
  }
  return { kind: "EffectDef", name, params, effect, body };
}

function serviceClassLines(service: ServiceDefPayload): readonly string[] {
  const serviceName = typeName(service.name);
  const lines = [
    `export class ${serviceName} extends Context.Tag(${JSON.stringify(service.name)})<`,
    `  ${serviceName},`,
    "  {",
  ];
  for (const method of service.methods) {
    if (!isRecord(method) || typeof method["name"] !== "string") continue;
    const params = arrayItems(method["params"]).map(methodParamTs).join(", ");
    lines.push(
      `    readonly ${safePropertyName(method["name"])}: (${params}) => ${effectTypeTs(method["effect"], { includeRequirements: false })};`,
    );
  }
  lines.push("  }", ">() {}");
  return lines;
}

function methodParamTs(param: JsonValue): string {
  if (!isRecord(param) || typeof param["name"] !== "string") return "value: unknown";
  return `${safeIdentifier(param["name"])}: ${typeExprTs(param["type"])}`;
}

function operationLines(effect: EffectDefPayload): readonly string[] {
  const params = effect.params.map(methodParamTs).join(", ");
  const returnType = effectTypeTs(effect.effect, { includeRequirements: true });
  const lines = [`export const ${safeIdentifier(effect.name)} = (${params}): ${returnType} =>`, "  Effect.gen(function* () {"];

  const services = Array.from(collectServiceCalls(effect.body)).sort();
  for (const service of services) {
    lines.push(`    const ${serviceVar(service)} = yield* ${typeName(service)};`);
  }

  lines.push(...effectBodyLines(effect.body, "    "));
  lines.push("  });");
  return lines;
}

function effectBodyLines(body: JsonValue, indent: string): readonly string[] {
  if (!isRecord(body)) return [`${indent}return undefined as never;`];

  switch (body["kind"]) {
    case "Do": {
      const lines: string[] = [];
      for (const binding of arrayItems(body["bindings"])) {
        if (!isRecord(binding) || typeof binding["name"] !== "string") continue;
        lines.push(`${indent}const ${safeIdentifier(binding["name"])} = ${yieldableExpr(binding["value"])};`);
      }
      lines.push(...returnLines(body["body"], indent));
      return lines;
    }
    default:
      return returnLines(body, indent);
  }
}

function returnLines(expr: JsonValue, indent: string): readonly string[] {
  if (!isRecord(expr)) return [`${indent}return undefined as never;`];
  switch (expr["kind"]) {
    case "Succeed":
      return [`${indent}return ${valueExprTs(expr["value"])};`];
    case "Pure":
      return [`${indent}return ${valueExprTs(expr["value"])};`];
    case "Fail":
      return [`${indent}return yield* Effect.fail(${errorExprTs(expr["error"])});`];
    default:
      return [`${indent}return ${yieldableExpr(expr)};`];
  }
}

function yieldableExpr(expr: JsonValue): string {
  if (!isRecord(expr)) return "undefined as never";
  switch (expr["kind"]) {
    case "ServiceCall":
      return `yield* ${serviceVar(String(expr["service"] ?? "service"))}.${safePropertyName(String(expr["method"] ?? "method"))}(${arrayItems(expr["args"]).map(valueExprTs).join(", ")})`;
    case "OperationCall":
      return `yield* ${safeIdentifier(String(expr["operation"] ?? "operation"))}(${arrayItems(expr["args"]).map(valueExprTs).join(", ")})`;
    case "Succeed":
      return `yield* Effect.succeed(${valueExprTs(expr["value"])})`;
    case "Fail":
      return `yield* Effect.fail(${errorExprTs(expr["error"])})`;
    case "Pure":
      return valueExprTs(expr["value"]);
    default:
      return "undefined as never";
  }
}

function valueExprTs(expr: JsonValue): string {
  if (!isRecord(expr)) return JSON.stringify(expr);
  switch (expr["kind"]) {
    case "Var":
      return safeIdentifier(String(expr["name"] ?? "value"));
    case "Literal":
      return JSON.stringify(expr["value"]);
    case "Record":
      return `{ ${arrayItems(expr["entries"]).map(recordEntryTs).join(", ")} }`;
    case "Vector":
    case "List":
      return `[${arrayItems(expr["items"]).map(valueExprTs).join(", ")}]`;
    case "Expr":
      return "undefined";
    default:
      return "undefined";
  }
}

function recordEntryTs(entry: JsonValue): string {
  if (!isRecord(entry)) return "";
  const key = recordKeyTs(entry["key"]);
  return `${key}: ${valueExprTs(entry["value"])}`;
}

function recordKeyTs(key: JsonValue): string {
  if (!isRecord(key)) return String(key);
  if (key["kind"] === "Literal") return safePropertyName(String(key["value"]));
  if (key["kind"] === "Var") return safePropertyName(String(key["name"]));
  return "unknown";
}

function errorExprTs(error: JsonValue | undefined): string {
  if (typeof error === "string") return `{ _tag: ${JSON.stringify(error)} }`;
  return valueExprTs(error ?? null);
}

function collectServiceCalls(expr: JsonValue, services = new Set<string>()): ReadonlySet<string> {
  if (Array.isArray(expr)) {
    for (const item of expr) collectServiceCalls(item, services);
    return services;
  }
  if (!isRecord(expr)) return services;
  if (expr["kind"] === "ServiceCall" && typeof expr["service"] === "string") {
    services.add(expr["service"]);
  }
  for (const value of Object.values(expr)) collectServiceCalls(value, services);
  return services;
}

function effectTypeTs(effect: JsonValue | undefined, options: { readonly includeRequirements: boolean }): string {
  if (!isRecord(effect) || effect["kind"] !== "Effect") return "Effect.Effect<unknown>";
  const success = typeExprTs(effect["success"]);
  const errors = symbolUnion(effect["errors"], "never");
  if (!options.includeRequirements) return `Effect.Effect<${success}, ${errors}>`;
  return `Effect.Effect<${success}, ${errors}, ${symbolUnion(effect["requirements"], "never")}>`;
}

function typeExprTs(type: JsonValue | undefined): string {
  if (!isRecord(type)) return "unknown";
  switch (type["kind"]) {
    case "Primitive":
      return primitiveTs(type["name"]);
    case "Ref":
      return typeName(String(type["name"] ?? "Unknown"));
    case "Array":
      return `ReadonlyArray<${typeExprTs(type["item"])}>`;
    case "Optional":
      return `${typeExprTs(type["item"])} | undefined`;
    case "Map":
      return `Readonly<Record<string, ${typeExprTs(type["value"])}>>`;
    case "Effect":
      return effectTypeTs(type, { includeRequirements: true });
    default:
      return "unknown";
  }
}

function primitiveTs(name: JsonValue | undefined): string {
  switch (name) {
    case "String":
      return "string";
    case "Int":
    case "Float":
    case "Number":
      return "number";
    case "Bool":
      return "boolean";
    case "Unit":
      return "void";
    default:
      return "unknown";
  }
}

function symbolUnion(value: JsonValue | undefined, empty: string): string {
  const items = arrayItems(value).filter((item): item is string => typeof item === "string");
  return items.length === 0 ? empty : items.map(typeName).join(" | ");
}

function arrayItems(value: JsonValue | undefined): readonly JsonValue[] {
  return Array.isArray(value) ? value : [];
}

function safeIdentifier(name: string): string {
  const normalized = name.replace(/[^A-Za-z0-9_$]/g, "_");
  if (/^[A-Za-z_$][\w$]*$/.test(normalized)) return normalized;
  return `_${normalized}`;
}

function safePropertyName(name: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}

function serviceVar(name: string): string {
  const identifier = safeIdentifier(typeName(name));
  return `${identifier.charAt(0).toLowerCase()}${identifier.slice(1)}`;
}

function typeName(name: string): string {
  const normalized = name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("");
  return /^[A-Za-z]/.test(normalized) ? normalized : `Generated${normalized}`;
}

function isRecord(value: unknown): value is Readonly<Record<string, JsonValue>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
