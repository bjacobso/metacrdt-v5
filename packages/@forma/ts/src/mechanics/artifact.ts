import type { JsonValue, PackageableDeclaration } from "../artifact/artifact.js";
import type { Span } from "../engine/operations.js";
import type { SExpr } from "../reader/types.js";

export interface MechanicsArtifactDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly span?: Span;
}

export type MechanicsArtifactResult =
  | { readonly ok: true; readonly declarations: readonly PackageableDeclaration[] }
  | { readonly ok: false; readonly diagnostics: readonly MechanicsArtifactDiagnostic[] };

type MechanicsJsonResult =
  | { readonly ok: true; readonly value: JsonValue }
  | { readonly ok: false; readonly diagnostics: readonly MechanicsArtifactDiagnostic[] };

type ServiceMethodEffects = ReadonlyMap<string, JsonValue>;
type OperationEffects = ReadonlyMap<string, JsonValue>;

export function mechanicsPackageableDeclarations(
  exprs: readonly SExpr[],
  sourceId: string,
): MechanicsArtifactResult {
  const declarations: PackageableDeclaration[] = [];
  const signatures = operationSignatures(exprs);
  const serviceMethodEffects = collectServiceMethodEffects(exprs, sourceId);
  const operationEffects = collectOperationEffects(exprs, sourceId, signatures);

  for (let formIndex = 0; formIndex < exprs.length; formIndex++) {
    const expr = exprs[formIndex]!;
    if (!isMechanicsArtifactForm(expr)) continue;

    const result = declaration(
      expr,
      sourceId,
      formIndex,
      signatures,
      serviceMethodEffects,
      operationEffects,
    );
    if (!result.ok) return result;
    declarations.push(result.declaration);
  }

  return { ok: true, declarations };
}

export function isMechanicsArtifactForm(expr: SExpr): boolean {
  return (
    isDefineSchemaForm(expr) ||
    isDefineErrorForm(expr) ||
    isDefineServiceForm(expr) ||
    isDefineOperationForm(expr)
  );
}

function isDefineSchemaForm(expr: SExpr): boolean {
  return (
    expr._tag === "List" &&
    symName(expr.items[0]) === "define-schema" &&
    expr.items.length === 3 &&
    isSchemaProjectionExpr(expr.items[2]!)
  );
}

function isDefineErrorForm(expr: SExpr): boolean {
  return (
    expr._tag === "List" &&
    symName(expr.items[0]) === "define-error" &&
    expr.items.length === 3 &&
    isFieldsBlock(expr.items[2]!)
  );
}

function isDefineServiceForm(expr: SExpr): boolean {
  return (
    expr._tag === "List" &&
    symName(expr.items[0]) === "define-service" &&
    expr.items.length === 3 &&
    isMethodsBlock(expr.items[2]!)
  );
}

function isDefineOperationForm(expr: SExpr): boolean {
  return expr._tag === "List" && symName(expr.items[0]) === "define-operation";
}

function isSchemaProjectionExpr(expr: SExpr): boolean {
  if (expr._tag === "Sym") return !expr.name.startsWith(":");
  if (expr._tag !== "List" || expr.items.length === 0) return false;
  const head = canonicalSchemaHead(symName(expr.items[0]));
  return (
    head === "Struct" ||
    head === "Array" ||
    head === "Optional" ||
    head === "Map" ||
    head === "Ref" ||
    head === "Brand" ||
    head === "Enum" ||
    head === "Literal" ||
    head === "Tuple" ||
    head === "Union" ||
    head === "TaggedUnion" ||
    (head !== undefined &&
      !head.startsWith(":") &&
      expr.items.length > 1 &&
      metadataPairs(expr.items.slice(1)).ok)
  );
}

function isFieldsBlock(expr: SExpr): expr is Extract<SExpr, { readonly _tag: "List" }> {
  return expr._tag === "List" && symName(expr.items[0]) === ":fields";
}

function isMethodsBlock(expr: SExpr): expr is Extract<SExpr, { readonly _tag: "List" }> {
  return expr._tag === "List" && symName(expr.items[0]) === ":methods";
}

function declaration(
  expr: SExpr,
  sourceId: string,
  formIndex: number,
  signatures: ReadonlyMap<string, SExpr>,
  serviceMethodEffects: ServiceMethodEffects,
  operationEffects: OperationEffects,
):
  | { readonly ok: true; readonly declaration: PackageableDeclaration }
  | { readonly ok: false; readonly diagnostics: readonly MechanicsArtifactDiagnostic[] } {
  if (expr._tag !== "List") {
    return {
      ok: false,
      diagnostics: [diagnostic(sourceId, expr, "artifact/form", "Expected declaration form.")],
    };
  }

  switch (symName(expr.items[0])) {
    case "define-schema":
      return schemaDeclaration(expr, sourceId, formIndex);
    case "define-error":
      return errorDeclaration(expr, sourceId, formIndex);
    case "define-service":
      return serviceDeclaration(expr, sourceId, formIndex);
    case "define-operation":
      return operationDeclaration(
        expr,
        sourceId,
        formIndex,
        signatures,
        serviceMethodEffects,
        operationEffects,
      );
    default:
      return {
        ok: false,
        diagnostics: [diagnostic(sourceId, expr, "artifact/form", "Expected mechanics form.")],
      };
  }
}

function operationSignatures(exprs: readonly SExpr[]): ReadonlyMap<string, SExpr> {
  const signatures = new Map<string, SExpr>();
  for (const expr of exprs) {
    if (expr._tag !== "List" || expr.items.length !== 3 || symName(expr.items[0]) !== ":") {
      continue;
    }
    const name = symName(expr.items[1]);
    if (name) signatures.set(name, expr.items[2]!);
  }
  return signatures;
}

function collectServiceMethodEffects(
  exprs: readonly SExpr[],
  sourceId: string,
): ServiceMethodEffects {
  const effects = new Map<string, JsonValue>();
  for (const expr of exprs) {
    if (!isDefineServiceForm(expr)) continue;
    if (expr._tag !== "List") continue;
    const serviceName = symName(expr.items[1]);
    const methodsBlock = expr.items[2];
    if (!serviceName || methodsBlock?._tag !== "List") continue;

    for (const method of methodsBlock.items.slice(1)) {
      const methodJson = methodToJson(sourceId, serviceName, method);
      if (!methodJson.ok || !isRecord(methodJson.value)) continue;
      const methodName = methodJson.value["name"];
      const effect = methodJson.value["effect"];
      if (typeof methodName === "string" && effect !== undefined) {
        effects.set(`${serviceName}.${methodName}`, effect);
      }
    }
  }
  return effects;
}

function collectOperationEffects(
  exprs: readonly SExpr[],
  sourceId: string,
  signatures: ReadonlyMap<string, SExpr>,
): OperationEffects {
  const effects = new Map<string, JsonValue>();
  for (const expr of exprs) {
    if (!isDefineOperationForm(expr) || expr._tag !== "List") continue;
    const name = symName(expr.items[1]);
    const paramsExpr = expr.items[2];
    if (!name || paramsExpr?._tag !== "Vector") continue;
    const signature = signatures.get(name);
    if (!signature) continue;
    const signatureJson = operationSignatureToJson(sourceId, signature, paramsExpr);
    if (signatureJson.ok) {
      effects.set(name, signatureJson.value.effect);
    }
  }
  return effects;
}

function schemaDeclaration(
  expr: SExpr,
  sourceId: string,
  formIndex: number,
):
  | { readonly ok: true; readonly declaration: PackageableDeclaration }
  | { readonly ok: false; readonly diagnostics: readonly MechanicsArtifactDiagnostic[] } {
  if (expr._tag !== "List" || expr.items.length !== 3) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          sourceId,
          expr,
          "artifact/schema",
          "define-schema expects a schema name and schema expression.",
        ),
      ],
    };
  }

  const name = symName(expr.items[1]);
  if (!name) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          sourceId,
          expr.items[1]!,
          "artifact/schema",
          "define-schema expects a schema name.",
        ),
      ],
    };
  }

  const schema = schemaExprToJson(sourceId, expr.items[2]!);
  if (!schema.ok) return schema;

  return {
    ok: true,
    declaration: {
      summary: { kind: "SchemaDef", name, resultType: "SchemaDef" },
      payload: {
        kind: "SchemaDef",
        name,
        schema: schema.value,
      },
      payloadContract: "mechanics/schema-def/v0",
      validators: ["payload-contract"],
      sourceId,
      formIndex,
      span: spanOf(sourceId, expr),
    },
  };
}

function errorDeclaration(
  expr: SExpr,
  sourceId: string,
  formIndex: number,
):
  | { readonly ok: true; readonly declaration: PackageableDeclaration }
  | { readonly ok: false; readonly diagnostics: readonly MechanicsArtifactDiagnostic[] } {
  if (expr._tag !== "List" || expr.items.length !== 3) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          sourceId,
          expr,
          "artifact/error",
          "define-error expects an error name and (:fields ...) block.",
        ),
      ],
    };
  }

  const name = symName(expr.items[1]);
  if (!name) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          sourceId,
          expr.items[1]!,
          "artifact/error",
          "define-error expects an error name.",
        ),
      ],
    };
  }

  const fieldsBlock = expr.items[2]!;
  if (!isFieldsBlock(fieldsBlock)) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          sourceId,
          fieldsBlock,
          "artifact/error",
          "define-error expects a (:fields ...) block.",
        ),
      ],
    };
  }

  const fields: JsonValue[] = [];
  for (const field of fieldsBlock.items.slice(1)) {
    const result = fieldToJson(sourceId, field);
    if (!result.ok) return result;
    fields.push(result.value);
  }

  return {
    ok: true,
    declaration: {
      summary: { kind: "ErrorDef", name, resultType: "ErrorDef" },
      payload: {
        kind: "ErrorDef",
        name,
        schema: { kind: "Struct", fields },
      },
      payloadContract: "mechanics/error-def/v0",
      validators: ["payload-contract"],
      sourceId,
      formIndex,
      span: spanOf(sourceId, expr),
    },
  };
}

function serviceDeclaration(
  expr: SExpr,
  sourceId: string,
  formIndex: number,
):
  | { readonly ok: true; readonly declaration: PackageableDeclaration }
  | { readonly ok: false; readonly diagnostics: readonly MechanicsArtifactDiagnostic[] } {
  if (expr._tag !== "List" || expr.items.length !== 3) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          sourceId,
          expr,
          "artifact/service",
          "define-service expects a service name and (:methods ...) block.",
        ),
      ],
    };
  }

  const name = symName(expr.items[1]);
  if (!name) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          sourceId,
          expr.items[1]!,
          "artifact/service",
          "define-service expects a service name.",
        ),
      ],
    };
  }

  const methodsBlock = expr.items[2]!;
  if (!isMethodsBlock(methodsBlock)) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          sourceId,
          methodsBlock,
          "artifact/service",
          "define-service expects a (:methods ...) block.",
        ),
      ],
    };
  }

  const methods: JsonValue[] = [];
  for (const method of methodsBlock.items.slice(1)) {
    const result = methodToJson(sourceId, name, method);
    if (!result.ok) return result;
    methods.push(result.value);
  }

  return {
    ok: true,
    declaration: {
      summary: { kind: "ServiceDef", name, resultType: "ServiceDef" },
      payload: {
        kind: "ServiceDef",
        name,
        methods,
      },
      payloadContract: "mechanics/service-def/v0",
      validators: ["payload-contract"],
      sourceId,
      formIndex,
      span: spanOf(sourceId, expr),
    },
  };
}

function operationDeclaration(
  expr: SExpr,
  sourceId: string,
  formIndex: number,
  signatures: ReadonlyMap<string, SExpr>,
  serviceMethodEffects: ServiceMethodEffects,
  operationEffects: OperationEffects,
):
  | { readonly ok: true; readonly declaration: PackageableDeclaration }
  | { readonly ok: false; readonly diagnostics: readonly MechanicsArtifactDiagnostic[] } {
  if (expr._tag !== "List" || expr.items.length < 4) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          sourceId,
          expr,
          "artifact/effect",
          "define-operation expects a name, parameter vector, and body.",
        ),
      ],
    };
  }

  const name = symName(expr.items[1]);
  if (!name) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          sourceId,
          expr.items[1]!,
          "artifact/effect",
          "define-operation expects an operation name.",
        ),
      ],
    };
  }

  const paramsExpr = expr.items[2]!;
  if (paramsExpr._tag !== "Vector") {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          sourceId,
          paramsExpr,
          "artifact/effect",
          "define-operation expects a parameter vector.",
        ),
      ],
    };
  }

  const signature = signatures.get(name);
  if (!signature) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          sourceId,
          expr,
          "artifact/effect",
          "define-operation requires a preceding type signature.",
        ),
      ],
    };
  }

  const signatureJson = operationSignatureToJson(sourceId, signature, paramsExpr);
  if (!signatureJson.ok) return signatureJson;

  const bodyForms = expr.items.slice(3);
  const body = operationBodyToJson(
    sourceId,
    bodyForms,
    serviceMethodEffects,
    operationEffects,
    signatureJson.value.effect,
  );

  return {
    ok: true,
    declaration: {
      summary: { kind: "EffectDef", name, resultType: "EffectDef" },
      payload: {
        kind: "EffectDef",
        name,
        params: signatureJson.value.params,
        effect: signatureJson.value.effect,
        body,
      },
      payloadContract: "mechanics/effect-def/v0",
      validators: ["payload-contract"],
      sourceId,
      formIndex,
      span: spanOf(sourceId, expr),
    },
  };
}

function operationBodyToJson(
  sourceId: string,
  bodyForms: readonly SExpr[],
  serviceMethodEffects: ServiceMethodEffects,
  operationEffects: OperationEffects,
  effect: JsonValue,
): JsonValue {
  if (bodyForms.length === 1) {
    return effectCoreExprToJson(
      sourceId,
      bodyForms[0]!,
      serviceMethodEffects,
      operationEffects,
      effect,
    );
  }
  return {
    kind: "Do",
    forms: bodyForms.map((form) =>
      effectCoreExprToJson(sourceId, form, serviceMethodEffects, operationEffects, effect),
    ),
    effect,
    span: spanJson(sourceId, bodyForms[0]!),
  };
}

function effectCoreExprToJson(
  sourceId: string,
  expr: SExpr,
  serviceMethodEffects: ServiceMethodEffects,
  operationEffects: OperationEffects,
  effect: JsonValue,
): JsonValue {
  if (expr._tag === "List" && expr.items.length > 0) {
    const head = symName(expr.items[0]);
    if (head?.includes(".")) {
      const [service, method] = head.split(".", 2);
      if (service && method) {
        return {
          kind: "ServiceCall",
          service,
          method,
          args: expr.items.slice(1).map((arg) => valueExprToCoreJson(sourceId, arg)),
          effect: serviceMethodEffects.get(head) ?? effect,
          span: spanJson(sourceId, expr),
        };
      }
    }
    if (head && operationEffects.has(head)) {
      return {
        kind: "OperationCall",
        operation: head,
        args: expr.items.slice(1).map((arg) => valueExprToCoreJson(sourceId, arg)),
        effect: operationEffects.get(head) ?? effect,
        span: spanJson(sourceId, expr),
      };
    }

    switch (head) {
      case "succeed":
        return {
          kind: "Succeed",
          value: valueExprToCoreJson(sourceId, expr.items[1]!),
          effect,
          span: spanJson(sourceId, expr),
        };
      case "fail":
        return {
          kind: "Fail",
          error: scalarName(expr.items[1]) ?? valueExprToCoreJson(sourceId, expr.items[1]!),
          effect,
          span: spanJson(sourceId, expr),
        };
      case "<-":
        return {
          kind: "Bind",
          value: effectCoreExprToJson(
            sourceId,
            expr.items[1]!,
            serviceMethodEffects,
            operationEffects,
            effect,
          ),
          effect,
          span: spanJson(sourceId, expr),
        };
      case "do":
        return {
          kind: "Do",
          forms: expr.items
            .slice(1)
            .map((form) =>
              effectCoreExprToJson(sourceId, form, serviceMethodEffects, operationEffects, effect),
            ),
          effect,
          span: spanJson(sourceId, expr),
        };
      case "if":
        return {
          kind: "If",
          condition: valueExprToCoreJson(sourceId, expr.items[1]!),
          then: effectCoreExprToJson(
            sourceId,
            expr.items[2]!,
            serviceMethodEffects,
            operationEffects,
            effect,
          ),
          else: effectCoreExprToJson(
            sourceId,
            expr.items[3]!,
            serviceMethodEffects,
            operationEffects,
            effect,
          ),
          effect,
          span: spanJson(sourceId, expr),
        };
      case "when":
        return {
          kind: "When",
          condition: valueExprToCoreJson(sourceId, expr.items[1]!),
          body: effectBodyFormsToJson(
            sourceId,
            expr.items.slice(2),
            serviceMethodEffects,
            operationEffects,
            effect,
          ),
          effect,
          span: spanJson(sourceId, expr),
        };
      case "unless":
        return {
          kind: "Unless",
          condition: valueExprToCoreJson(sourceId, expr.items[1]!),
          body: effectBodyFormsToJson(
            sourceId,
            expr.items.slice(2),
            serviceMethodEffects,
            operationEffects,
            effect,
          ),
          effect,
          span: spanJson(sourceId, expr),
        };
      case "cond":
        return effectCondToJson(sourceId, expr, serviceMethodEffects, operationEffects, effect);
      case "do!":
        return effectDoToJson(sourceId, expr, serviceMethodEffects, operationEffects, effect);
      case "let":
        return effectLetToJson(sourceId, expr, serviceMethodEffects, operationEffects, effect);
      case "match":
        return effectMatchToJson(sourceId, expr, serviceMethodEffects, operationEffects, effect);
      default:
        break;
    }
  }

  return {
    kind: "Pure",
    value: valueExprToCoreJson(sourceId, expr),
    effect,
    span: spanJson(sourceId, expr),
  };
}

function effectCondToJson(
  sourceId: string,
  expr: Extract<SExpr, { readonly _tag: "List" }>,
  serviceMethodEffects: ServiceMethodEffects,
  operationEffects: OperationEffects,
  effect: JsonValue,
): JsonValue {
  const clauses: JsonValue[] = [];
  const items = expr.items.slice(1);
  for (let index = 0; index + 1 < items.length; index += 2) {
    clauses.push({
      condition: valueExprToCoreJson(sourceId, items[index]!),
      body: effectCoreExprToJson(
        sourceId,
        items[index + 1]!,
        serviceMethodEffects,
        operationEffects,
        effect,
      ),
      span: spanJson(sourceId, items[index]!),
    });
  }
  return {
    kind: "Cond",
    clauses,
    effect,
    span: spanJson(sourceId, expr),
  };
}

function effectDoToJson(
  sourceId: string,
  expr: Extract<SExpr, { readonly _tag: "List" }>,
  serviceMethodEffects: ServiceMethodEffects,
  operationEffects: OperationEffects,
  effect: JsonValue,
): JsonValue {
  const bindingsExpr = expr.items[1];
  const bindings =
    bindingsExpr?._tag === "Vector"
      ? bindingPairsToJson(
          sourceId,
          bindingsExpr.items,
          serviceMethodEffects,
          operationEffects,
          effect,
        )
      : [];
  return {
    kind: "Do",
    bindings,
    body: effectBodyFormsToJson(
      sourceId,
      expr.items.slice(2),
      serviceMethodEffects,
      operationEffects,
      effect,
    ),
    effect,
    span: spanJson(sourceId, expr),
  };
}

function effectLetToJson(
  sourceId: string,
  expr: Extract<SExpr, { readonly _tag: "List" }>,
  serviceMethodEffects: ServiceMethodEffects,
  operationEffects: OperationEffects,
  effect: JsonValue,
): JsonValue {
  const bindingsExpr = expr.items[1];
  const bindings =
    bindingsExpr?._tag === "Vector"
      ? bindingPairsToJson(
          sourceId,
          bindingsExpr.items,
          serviceMethodEffects,
          operationEffects,
          effect,
        )
      : [];
  return {
    kind: "Let",
    bindings,
    body: effectBodyFormsToJson(
      sourceId,
      expr.items.slice(2),
      serviceMethodEffects,
      operationEffects,
      effect,
    ),
    effect,
    span: spanJson(sourceId, expr),
  };
}

function effectBodyFormsToJson(
  sourceId: string,
  bodyForms: readonly SExpr[],
  serviceMethodEffects: ServiceMethodEffects,
  operationEffects: OperationEffects,
  effect: JsonValue,
): JsonValue {
  if (bodyForms.length === 1) {
    return effectCoreExprToJson(
      sourceId,
      bodyForms[0]!,
      serviceMethodEffects,
      operationEffects,
      effect,
    );
  }
  return {
    kind: "Do",
    forms: bodyForms.map((form) =>
      effectCoreExprToJson(sourceId, form, serviceMethodEffects, operationEffects, effect),
    ),
    effect,
    span: spanJson(sourceId, bodyForms[0]!),
  };
}

function bindingPairsToJson(
  sourceId: string,
  items: readonly SExpr[],
  serviceMethodEffects: ServiceMethodEffects,
  operationEffects: OperationEffects,
  effect: JsonValue,
): JsonValue[] {
  const bindings: JsonValue[] = [];
  for (let index = 0; index + 1 < items.length; index += 2) {
    const name = scalarName(items[index]);
    const value = unwrapArrowBind(items[index + 1]!);
    if (name) {
      bindings.push({
        name,
        value: effectCoreExprToJson(
          sourceId,
          value,
          serviceMethodEffects,
          operationEffects,
          effect,
        ),
        span: spanJson(sourceId, value),
      });
    }
  }
  return bindings;
}

function unwrapArrowBind(expr: SExpr): SExpr {
  if (expr._tag === "List" && symName(expr.items[0]) === "<-" && expr.items[1]) {
    return expr.items[1];
  }
  return expr;
}

function effectMatchToJson(
  sourceId: string,
  expr: Extract<SExpr, { readonly _tag: "List" }>,
  serviceMethodEffects: ServiceMethodEffects,
  operationEffects: OperationEffects,
  effect: JsonValue,
): JsonValue {
  const arms: JsonValue[] = [];
  const items = expr.items.slice(2);
  for (let index = 0; index + 1 < items.length; index += 2) {
    arms.push({
      pattern: valueExprToCoreJson(sourceId, items[index]!),
      body: effectCoreExprToJson(
        sourceId,
        items[index + 1]!,
        serviceMethodEffects,
        operationEffects,
        effect,
      ),
      span: spanJson(sourceId, items[index]!),
    });
  }
  return {
    kind: "Match",
    value: valueExprToCoreJson(sourceId, expr.items[1]!),
    arms,
    effect,
    span: spanJson(sourceId, expr),
  };
}

function valueExprToCoreJson(sourceId: string, expr: SExpr): JsonValue {
  switch (expr._tag) {
    case "Sym":
      if (expr.name.startsWith(":")) {
        return { kind: "Expr", source: sexprToJson(expr), span: spanJson(sourceId, expr) };
      }
      return { kind: "Var", name: expr.name, span: spanJson(sourceId, expr) };
    case "Str":
      return { kind: "Literal", value: expr.value, span: spanJson(sourceId, expr) };
    case "Num":
      return { kind: "Literal", value: expr.value, span: spanJson(sourceId, expr) };
    case "Bool":
      return { kind: "Literal", value: expr.value, span: spanJson(sourceId, expr) };
    case "List":
      return {
        kind: "List",
        items: expr.items.map((item) => valueExprToCoreJson(sourceId, item)),
        span: spanJson(sourceId, expr),
      };
    case "Vector":
      return {
        kind: "Vector",
        items: expr.items.map((item) => valueExprToCoreJson(sourceId, item)),
        span: spanJson(sourceId, expr),
      };
    case "Map":
      return {
        kind: "Record",
        entries: expr.pairs.map(([key, value]) => ({
          key: valueExprToCoreJson(sourceId, key),
          value: valueExprToCoreJson(sourceId, value),
        })),
        span: spanJson(sourceId, expr),
      };
    default:
      return { kind: "Expr", source: sexprToJson(expr), span: spanJson(sourceId, expr) };
  }
}

function operationSignatureToJson(
  sourceId: string,
  signature: SExpr,
  paramsExpr: Extract<SExpr, { readonly _tag: "Vector" }>,
):
  | {
      readonly ok: true;
      readonly value: {
        readonly params: readonly JsonValue[];
        readonly effect: JsonValue;
      };
    }
  | { readonly ok: false; readonly diagnostics: readonly MechanicsArtifactDiagnostic[] } {
  if (
    signature._tag !== "List" ||
    symName(signature.items[0]) !== "->" ||
    signature.items.length < 3
  ) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          sourceId,
          signature,
          "artifact/effect",
          "operation signature must be (-> Input... (Effect ...)).",
        ),
      ],
    };
  }

  const inputTypes = signature.items.slice(1, -1);
  if (inputTypes.length !== paramsExpr.items.length) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          sourceId,
          paramsExpr,
          "artifact/effect",
          "operation signature arity must match define-operation parameters.",
        ),
      ],
    };
  }

  const params: JsonValue[] = [];
  for (let index = 0; index < paramsExpr.items.length; index++) {
    const name = scalarName(paramsExpr.items[index]);
    if (!name) {
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            sourceId,
            paramsExpr.items[index]!,
            "artifact/effect",
            "operation parameters must be symbolic names.",
          ),
        ],
      };
    }
    const type = typeExprToJson(sourceId, inputTypes[index]!);
    if (!type.ok) return type;
    params.push({ name, type: type.value });
  }

  const effect = effectTypeToJson(sourceId, signature.items.at(-1)!);
  if (!effect.ok) return effect;

  return {
    ok: true,
    value: { params, effect: effect.value },
  };
}

function methodToJson(sourceId: string, serviceName: string, expr: SExpr): MechanicsJsonResult {
  if (expr._tag !== "List" || expr.items.length !== 3) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          sourceId,
          expr,
          "artifact/service-method",
          "service methods must be (name [param Type ...] ReturnEffect).",
        ),
      ],
    };
  }

  const name = symName(expr.items[0]);
  if (!name) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          sourceId,
          expr.items[0]!,
          "artifact/service-method",
          "service methods require a method name.",
        ),
      ],
    };
  }

  const params = methodParamsToJson(sourceId, expr.items[1]!);
  if (!params.ok) return params;

  const effect = effectTypeToJson(sourceId, expr.items[2]!, serviceName);
  if (!effect.ok) return effect;

  return {
    ok: true,
    value: {
      name,
      params: params.value,
      effect: effect.value,
    },
  };
}

function methodParamsToJson(sourceId: string, expr: SExpr): MechanicsJsonResult {
  if (expr._tag !== "Vector" || expr.items.length % 2 !== 0) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          sourceId,
          expr,
          "artifact/service-method",
          "service method params must be [name Type ...] pairs.",
        ),
      ],
    };
  }

  const params: JsonValue[] = [];
  for (let index = 0; index < expr.items.length; index += 2) {
    const name = scalarName(expr.items[index]);
    if (!name) {
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            sourceId,
            expr.items[index]!,
            "artifact/service-method",
            "service method params require symbolic names.",
          ),
        ],
      };
    }
    const type = typeExprToJson(sourceId, expr.items[index + 1]!);
    if (!type.ok) return type;
    params.push({ name, type: type.value });
  }

  return { ok: true, value: params };
}

function typeExprToJson(sourceId: string, expr: SExpr): MechanicsJsonResult {
  if (expr._tag === "List" && expr.items.length > 0) {
    const head = symName(expr.items[0]);
    switch (head) {
      case "Effect":
        return effectTypeToJson(sourceId, expr);
      case "Option":
      case "Optional": {
        if (expr.items.length !== 2) {
          return {
            ok: false,
            diagnostics: [
              diagnostic(sourceId, expr, "artifact/type", `${head} type expects one argument.`),
            ],
          };
        }
        const item = typeExprToJson(sourceId, expr.items[1]!);
        if (!item.ok) return item;
        return { ok: true, value: { kind: "Optional", item: item.value } };
      }
      case "Array":
      case "List": {
        if (expr.items.length !== 2) {
          return {
            ok: false,
            diagnostics: [
              diagnostic(sourceId, expr, "artifact/type", `${head} type expects one argument.`),
            ],
          };
        }
        const item = typeExprToJson(sourceId, expr.items[1]!);
        if (!item.ok) return item;
        return { ok: true, value: { kind: "Array", item: item.value } };
      }
      case "Map": {
        if (expr.items.length !== 2) {
          return {
            ok: false,
            diagnostics: [
              diagnostic(sourceId, expr, "artifact/type", "Map type expects one argument."),
            ],
          };
        }
        const value = typeExprToJson(sourceId, expr.items[1]!);
        if (!value.ok) return value;
        return { ok: true, value: { kind: "Map", value: value.value } };
      }
      case "Tuple": {
        const split = splitTrailingSchemaMetadata(expr.items.slice(1));
        if (!split.ok) {
          return {
            ok: false,
            diagnostics: [
              diagnostic(
                sourceId,
                expr,
                "artifact/type",
                "Tuple type metadata must be keyword/value pairs.",
              ),
            ],
          };
        }
        if (split.schemas.length === 0) {
          return {
            ok: false,
            diagnostics: [
              diagnostic(sourceId, expr, "artifact/type", "Tuple type expects at least one item."),
            ],
          };
        }
        const items: JsonValue[] = [];
        for (const itemExpr of split.schemas) {
          const item = typeExprToJson(sourceId, itemExpr);
          if (!item.ok) return item;
          items.push(item.value);
        }
        return { ok: true, value: { kind: "Tuple", items } };
      }
      default:
        break;
    }
  }

  return schemaExprToJson(sourceId, expr);
}

function effectTypeToJson(
  sourceId: string,
  expr: SExpr,
  serviceRequirement?: string,
): MechanicsJsonResult {
  if (
    expr._tag !== "List" ||
    expr.items.length !== 4 ||
    symName(expr.items[0]) !== "Effect" ||
    expr.items[2]!._tag !== "Vector" ||
    expr.items[3]!._tag !== "Vector"
  ) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          sourceId,
          expr,
          "artifact/effect-type",
          "Effect type expects (Effect Success [Errors...] [Requirements...]).",
        ),
      ],
    };
  }

  const success = typeExprToJson(sourceId, expr.items[1]!);
  if (!success.ok) return success;

  const errors = symbolicSetToJson(sourceId, expr.items[2]!, "errors");
  if (!errors.ok) return errors;

  const requirements = symbolicSetToJson(sourceId, expr.items[3]!, "requirements");
  if (!requirements.ok) return requirements;

  const requirementNames = [...(requirements.value as string[])];
  if (serviceRequirement && !requirementNames.includes(serviceRequirement)) {
    requirementNames.push(serviceRequirement);
  }

  return {
    ok: true,
    value: {
      kind: "Effect",
      success: success.value,
      errors: errors.value,
      requirements: requirementNames,
    },
  };
}

function symbolicSetToJson(sourceId: string, expr: SExpr, label: string): MechanicsJsonResult {
  if (expr._tag !== "Vector") {
    return {
      ok: false,
      diagnostics: [
        diagnostic(sourceId, expr, "artifact/effect-type", `Effect ${label} must be a vector.`),
      ],
    };
  }

  const names: string[] = [];
  for (const item of expr.items) {
    const name = scalarName(item);
    if (!name) {
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            sourceId,
            item,
            "artifact/effect-type",
            `Effect ${label} entries must be symbolic names.`,
          ),
        ],
      };
    }
    names.push(name);
  }

  return { ok: true, value: names };
}

function schemaExprToJson(sourceId: string, expr: SExpr): MechanicsJsonResult {
  const scalar = scalarName(expr);
  if (scalar) {
    return { ok: true, value: primitiveOrRef(scalar, spanJson(sourceId, expr)) };
  }

  if (expr._tag !== "List" || expr.items.length === 0) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          sourceId,
          expr,
          "artifact/schema",
          "Expected a schema symbol or schema expression.",
        ),
      ],
    };
  }

  const head = canonicalSchemaHead(symName(expr.items[0]));
  switch (head) {
    case "Struct": {
      const fields: JsonValue[] = [];
      for (const field of expr.items.slice(1)) {
        const result = fieldToJson(sourceId, field);
        if (!result.ok) return result;
        fields.push(result.value);
      }
      return { ok: true, value: { kind: "Struct", fields, span: spanJson(sourceId, expr) } };
    }
    case "Array":
    case "Optional": {
      const metadata = metadataPairs(expr.items.slice(2));
      if (!metadata.ok) {
        return {
          ok: false,
          diagnostics: [
            diagnostic(
              sourceId,
              expr,
              "artifact/schema",
              `${head} schema metadata must be keyword/value pairs.`,
            ),
          ],
        };
      }
      if (expr.items.length < 2) {
        return {
          ok: false,
          diagnostics: [
            diagnostic(sourceId, expr, "artifact/schema", `${head} schema expects an item schema.`),
          ],
        };
      }
      const item = schemaExprToJson(sourceId, expr.items[1]!);
      if (!item.ok) return item;
      return {
        ok: true,
        value: applyMetadata(
          { kind: head, item: item.value, span: spanJson(sourceId, expr) },
          metadata.pairs,
          spanJson(sourceId, expr),
        ),
      };
    }
    case "Map": {
      const metadata = metadataPairs(expr.items.slice(2));
      if (!metadata.ok) {
        return {
          ok: false,
          diagnostics: [
            diagnostic(
              sourceId,
              expr,
              "artifact/schema",
              "Map schema metadata must be keyword/value pairs.",
            ),
          ],
        };
      }
      if (expr.items.length < 2) {
        return {
          ok: false,
          diagnostics: [
            diagnostic(sourceId, expr, "artifact/schema", "Map schema expects a value schema."),
          ],
        };
      }
      const value = schemaExprToJson(sourceId, expr.items[1]!);
      if (!value.ok) return value;
      return {
        ok: true,
        value: applyMetadata(
          { kind: "Map", value: value.value, span: spanJson(sourceId, expr) },
          metadata.pairs,
          spanJson(sourceId, expr),
        ),
      };
    }
    case "Ref": {
      const target = scalarName(expr.items[1]);
      const metadata = metadataPairs(expr.items.slice(2));
      if (!target) {
        return {
          ok: false,
          diagnostics: [
            diagnostic(
              sourceId,
              expr.items[1] ?? expr,
              "artifact/schema",
              "Ref schema expects a symbolic target.",
            ),
          ],
        };
      }
      if (!metadata.ok) {
        return {
          ok: false,
          diagnostics: [
            diagnostic(
              sourceId,
              expr,
              "artifact/schema",
              "Ref schema metadata must be keyword/value pairs.",
            ),
          ],
        };
      }
      return {
        ok: true,
        value: applyMetadata(
          { kind: "Ref", name: target, span: spanJson(sourceId, expr) },
          metadata.pairs,
          spanJson(sourceId, expr),
        ),
      };
    }
    case "Brand": {
      if (expr.items.length !== 3) {
        return {
          ok: false,
          diagnostics: [
            diagnostic(
              sourceId,
              expr,
              "artifact/schema",
              "Brand schema expects a brand name and base schema.",
            ),
          ],
        };
      }
      const name = scalarName(expr.items[1]);
      if (!name) {
        return {
          ok: false,
          diagnostics: [
            diagnostic(
              sourceId,
              expr.items[1]!,
              "artifact/schema",
              "Brand schema expects a symbolic brand name.",
            ),
          ],
        };
      }
      const schema = schemaExprToJson(sourceId, expr.items[2]!);
      if (!schema.ok) return schema;
      return {
        ok: true,
        value: { kind: "Brand", name, schema: schema.value, span: spanJson(sourceId, expr) },
      };
    }
    case "Enum": {
      const values: JsonValue[] = [];
      for (const value of expr.items.slice(1)) {
        const scalar = scalarName(value);
        if (scalar === undefined) {
          return {
            ok: false,
            diagnostics: [
              diagnostic(
                sourceId,
                value,
                "artifact/schema",
                "Enum schema values must be symbols, keywords, or strings.",
              ),
            ],
          };
        }
        values.push(scalar);
      }
      if (values.length === 0) {
        return {
          ok: false,
          diagnostics: [
            diagnostic(
              sourceId,
              expr,
              "artifact/schema",
              "Enum schema expects at least one value.",
            ),
          ],
        };
      }
      return { ok: true, value: { kind: "Literal", values, span: spanJson(sourceId, expr) } };
    }
    case "Literal": {
      const values: JsonValue[] = [];
      for (const value of expr.items.slice(1)) {
        const scalar = scalarJson(value);
        if (scalar === undefined) {
          return {
            ok: false,
            diagnostics: [
              diagnostic(
                sourceId,
                value,
                "artifact/schema",
                "Literal schema values must be scalar values.",
              ),
            ],
          };
        }
        values.push(scalar);
      }
      return { ok: true, value: { kind: "Literal", values, span: spanJson(sourceId, expr) } };
    }
    case "Tuple": {
      const split = splitTrailingSchemaMetadata(expr.items.slice(1));
      if (!split.ok) {
        return {
          ok: false,
          diagnostics: [
            diagnostic(
              sourceId,
              expr,
              "artifact/schema",
              "Tuple schema metadata must be keyword/value pairs.",
            ),
          ],
        };
      }
      if (split.schemas.length === 0) {
        return {
          ok: false,
          diagnostics: [
            diagnostic(
              sourceId,
              expr,
              "artifact/schema",
              "Tuple schema expects at least one item schema.",
            ),
          ],
        };
      }
      const items: JsonValue[] = [];
      for (const itemExpr of split.schemas) {
        const item = schemaExprToJson(sourceId, itemExpr);
        if (!item.ok) return item;
        items.push(item.value);
      }
      return {
        ok: true,
        value: applyMetadata(
          { kind: "Tuple", items, span: spanJson(sourceId, expr) },
          split.pairs,
          spanJson(sourceId, expr),
        ),
      };
    }
    case "Union": {
      const split = splitTrailingSchemaMetadata(expr.items.slice(1));
      if (!split.ok) {
        return {
          ok: false,
          diagnostics: [
            diagnostic(
              sourceId,
              expr,
              "artifact/schema",
              "Union schema metadata must be keyword/value pairs.",
            ),
          ],
        };
      }
      if (split.schemas.length === 0) {
        return {
          ok: false,
          diagnostics: [
            diagnostic(
              sourceId,
              expr,
              "artifact/schema",
              "Union schema expects at least one variant schema.",
            ),
          ],
        };
      }
      const variants: JsonValue[] = [];
      for (const variant of split.schemas) {
        const schema = schemaExprToJson(sourceId, variant);
        if (!schema.ok) return schema;
        variants.push(schema.value);
      }
      return {
        ok: true,
        value: applyMetadata(
          { kind: "Union", variants, span: spanJson(sourceId, expr) },
          split.pairs,
          spanJson(sourceId, expr),
        ),
      };
    }
    case "TaggedUnion":
      return taggedUnionSchemaToJson(sourceId, expr);
    default: {
      if (!head) {
        return {
          ok: false,
          diagnostics: [
            diagnostic(sourceId, expr, "artifact/schema", "Expected a schema expression."),
          ],
        };
      }
      const metadata = metadataPairs(expr.items.slice(1));
      if (!metadata.ok) {
        return {
          ok: false,
          diagnostics: [
            diagnostic(
              sourceId,
              expr,
              "artifact/schema",
              "Schema metadata must be keyword/value pairs.",
            ),
          ],
        };
      }
      return {
        ok: true,
        value: applyMetadata(
          primitiveOrRef(head, spanJson(sourceId, expr)),
          metadata.pairs,
          spanJson(sourceId, expr),
        ),
      };
    }
  }
}

function taggedUnionSchemaToJson(
  sourceId: string,
  expr: SExpr & { readonly _tag: "List" },
): MechanicsJsonResult {
  const discriminator = scalarName(expr.items[1]);
  if (!discriminator) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          sourceId,
          expr.items[1] ?? expr,
          "artifact/schema",
          "TaggedUnion schema expects a discriminator.",
        ),
      ],
    };
  }
  if (expr.items.length < 3) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          sourceId,
          expr,
          "artifact/schema",
          "TaggedUnion schema expects at least one variant schema.",
        ),
      ],
    };
  }

  const split = splitTrailingSchemaMetadata(expr.items.slice(2));
  if (!split.ok) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          sourceId,
          expr,
          "artifact/schema",
          "TaggedUnion schema metadata must be keyword/value pairs.",
        ),
      ],
    };
  }
  if (split.schemas.length === 0) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          sourceId,
          expr,
          "artifact/schema",
          "TaggedUnion schema expects at least one variant schema.",
        ),
      ],
    };
  }

  const variants: JsonValue[] = [];
  for (const variant of split.schemas) {
    const variantJson = taggedUnionVariantToJson(sourceId, variant);
    if (!variantJson.ok) return variantJson;
    variants.push(variantJson.value);
  }

  return {
    ok: true,
    value: applyMetadata(
      { kind: "TaggedUnion", discriminator, variants, span: spanJson(sourceId, expr) },
      split.pairs,
      spanJson(sourceId, expr),
    ),
  };
}

function taggedUnionVariantToJson(sourceId: string, expr: SExpr): MechanicsJsonResult {
  if (expr._tag !== "Vector" || expr.items.length !== 2) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          sourceId,
          expr,
          "artifact/schema",
          "TaggedUnion variants must be [tag SchemaExpr].",
        ),
      ],
    };
  }

  const tag = scalarName(expr.items[0]);
  if (!tag) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          sourceId,
          expr.items[0]!,
          "artifact/schema",
          "TaggedUnion variant tags must be symbols, keywords, or strings.",
        ),
      ],
    };
  }

  const schema = schemaExprToJson(sourceId, expr.items[1]!);
  if (!schema.ok) return schema;
  return { ok: true, value: { tag, schema: schema.value, span: spanJson(sourceId, expr) } };
}

function fieldToJson(sourceId: string, expr: SExpr): MechanicsJsonResult {
  const items =
    expr._tag === "Vector"
      ? expr.items
      : expr._tag === "List" && symName(expr.items[0]) === "field"
        ? expr.items.slice(1)
        : expr._tag === "List"
          ? expr.items
          : undefined;

  if (!items || items.length !== 2) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          sourceId,
          expr,
          "artifact/schema-field",
          "Struct schema fields must be [name SchemaExpr] or (field name SchemaExpr).",
        ),
      ],
    };
  }

  const name = scalarName(items[0]!);
  if (!name) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          sourceId,
          items[0]!,
          "artifact/schema-field",
          "Struct schema field names must be symbols, keywords, or strings.",
        ),
      ],
    };
  }

  const schema = schemaExprToJson(sourceId, items[1]!);
  if (!schema.ok) return schema;
  return { ok: true, value: { name, schema: schema.value, span: spanJson(sourceId, expr) } };
}

function primitiveOrRef(name: string, span: JsonValue): JsonValue {
  const primitive = primitiveName(name);
  return primitive ? { kind: "Primitive", name: primitive, span } : { kind: "Ref", name, span };
}

function canonicalSchemaHead(head: string | undefined): string | undefined {
  switch (head) {
    case "object":
    case "Object":
      return "Struct";
    case "array":
      return "Array";
    case "optional":
      return "Optional";
    case "map":
      return "Map";
    case "ref":
      return "Ref";
    case "brand":
      return "Brand";
    case "enum":
      return "Enum";
    case "literal":
      return "Literal";
    case "tuple":
      return "Tuple";
    case "union":
      return "Union";
    case "tagged-union":
    case "taggedUnion":
      return "TaggedUnion";
    default:
      return head;
  }
}

function applyMetadata(
  schema: JsonValue,
  pairs: readonly (readonly [string, SExpr])[],
  span: JsonValue,
): JsonValue {
  let wrapped = schema;
  const metadata: Record<string, JsonValue> = {};

  for (const [key, value] of pairs) {
    if (key === "brand") {
      const name = scalarName(value);
      if (name) {
        wrapped = { kind: "Brand", name, schema: wrapped, span };
      }
      continue;
    }

    const scalar = scalarJson(value);
    if (scalar !== undefined) {
      metadata[key] = scalar;
    }
  }

  return Object.keys(metadata).length > 0
    ? { kind: "Annotated", schema: wrapped, metadata, span }
    : wrapped;
}

function metadataPairs(
  values: readonly SExpr[],
):
  | { readonly ok: true; readonly pairs: readonly (readonly [string, SExpr])[] }
  | { readonly ok: false } {
  if (values.length % 2 !== 0) return { ok: false };

  const pairs: Array<readonly [string, SExpr]> = [];
  for (let index = 0; index < values.length; index += 2) {
    const key = scalarName(values[index]!);
    if (!key) return { ok: false };
    pairs.push([key, values[index + 1]!] as const);
  }
  return { ok: true, pairs };
}

function splitTrailingSchemaMetadata(values: readonly SExpr[]):
  | {
      readonly ok: true;
      readonly schemas: readonly SExpr[];
      readonly pairs: readonly (readonly [string, SExpr])[];
    }
  | { readonly ok: false } {
  const metadataStart = values.findIndex((value) => symName(value)?.startsWith(":") === true);
  if (metadataStart === -1) return { ok: true, schemas: values, pairs: [] };

  const metadata = values.slice(metadataStart);
  if (metadata.length % 2 !== 0) return { ok: false };

  const pairs: Array<readonly [string, SExpr]> = [];
  for (let index = 0; index < metadata.length; index += 2) {
    const key = symName(metadata[index]!);
    if (!key?.startsWith(":")) return { ok: false };
    pairs.push([key.replace(/^:/, ""), metadata[index + 1]!] as const);
  }

  return { ok: true, schemas: values.slice(0, metadataStart), pairs };
}

function primitiveName(name: string): string | undefined {
  switch (name.toLowerCase()) {
    case "string":
      return "String";
    case "int":
    case "integer":
      return "Int";
    case "float":
      return "Float";
    case "number":
      return "Number";
    case "bool":
    case "boolean":
      return "Bool";
    case "bytes":
      return "Bytes";
    case "datetime":
      return "DateTime";
    case "json":
      return "Json";
    case "unit":
      return "Unit";
    default:
      return undefined;
  }
}

function scalarJson(expr: SExpr): JsonValue | undefined {
  switch (expr._tag) {
    case "Sym":
      return expr.name;
    case "Str":
      return expr.value;
    case "Num":
      return expr.value;
    case "Bool":
      return expr.value;
    default:
      return undefined;
  }
}

function scalarName(expr: SExpr | undefined): string | undefined {
  if (!expr) return undefined;
  if (expr._tag === "Sym") return expr.name.replace(/^:/, "");
  if (expr._tag === "Str") return expr.value.replace(/^:/, "");
  return undefined;
}

function symName(expr: SExpr | undefined): string | undefined {
  return expr?._tag === "Sym" ? expr.name : undefined;
}

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sexprToJson(expr: SExpr): JsonValue {
  switch (expr._tag) {
    case "Sym":
      return { kind: "Symbol", name: expr.name };
    case "Str":
      return { kind: "String", value: expr.value };
    case "Num":
      return { kind: "Number", value: expr.value };
    case "Bool":
      return { kind: "Bool", value: expr.value };
    case "List":
      return { kind: "List", items: expr.items.map(sexprToJson) };
    case "Vector":
      return { kind: "Vector", items: expr.items.map(sexprToJson) };
    case "Map":
      return {
        kind: "Map",
        entries: expr.pairs.map(([key, value]) => ({
          key: sexprToJson(key),
          value: sexprToJson(value),
        })),
      };
    case "Set":
      return { kind: "Set", items: expr.items.map(sexprToJson) };
    case "Error":
      return { kind: "Error" };
  }
}

function spanOf(sourceId: string, expr: SExpr): Span {
  return {
    sourceId,
    startOffset: expr.loc.start,
    endOffset: expr.loc.end,
    startLine: expr.loc.line,
    startColumn: expr.loc.col,
  };
}

function spanJson(sourceId: string, expr: SExpr): JsonValue {
  return {
    sourceId,
    startOffset: expr.loc.start,
    endOffset: expr.loc.end,
  };
}

function diagnostic(
  sourceId: string,
  expr: SExpr,
  code: string,
  message: string,
): MechanicsArtifactDiagnostic {
  return { code, message, span: spanOf(sourceId, expr) };
}
