import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { packageDir, readPreludes } from "./corpus.mjs";

const nativeCli = resolve(packageDir, "dist/native/oo_lang_cli.exe");

const daemon = spawn(nativeCli, ["daemon"], {
  cwd: packageDir,
  stdio: ["pipe", "pipe", "pipe"],
});

let stderr = "";
daemon.stderr.on("data", (chunk) => {
  stderr += chunk;
});

const responses = [];
const waiters = [];
const lines = createInterface({ input: daemon.stdout });

lines.on("line", (line) => {
  responses.push(line);
  const waiter = waiters.shift();
  if (waiter) {
    waiter();
  }
});

const waitForLine = async () => {
  if (responses.length > 0) return responses.shift();
  return new Promise((resolveLine, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for daemon response. stderr: ${stderr}`));
    }, 5000);
    waiters.push(() => {
      clearTimeout(timeout);
      resolveLine(responses.shift());
    });
  });
};

const request = async (payload) => {
  daemon.stdin.write(`${JSON.stringify(payload)}\n`);
  const line = await waitForLine();
  try {
    return JSON.parse(line);
  } catch (error) {
    throw new Error(`Could not parse daemon response ${JSON.stringify(line)}: ${error}`);
  }
};

const expectOk = (label, response) => {
  if (response?.ok !== true) {
    throw new Error(`${label} failed:\n${JSON.stringify(response, null, 2)}`);
  }
};

const entryValue = (mapValue, keyValue) => {
  const entry = mapValue?.entries?.find((candidate) => candidate.key?.value === keyValue);
  return entry?.value;
};

const applicationFormName = (value) => {
  if (value?.kind === "list" || value?.kind === "vector") {
    const head = value.items?.[0];
    if (head?.kind === "string" || head?.kind === "symbol" || head?.kind === "keyword") {
      return head.value;
    }
    return null;
  }
  if (entryValue(value, ":kind")?.value !== "application") {
    return null;
  }
  const form = entryValue(value, ":form");
  if (form?.kind === "string" || form?.kind === "symbol" || form?.kind === "keyword") {
    return form.value;
  }
  return null;
};

const applicationArgs = (value) => {
  if (value?.kind === "list" || value?.kind === "vector") {
    return value.items?.slice(1) ?? [];
  }
  const args = entryValue(value, ":args");
  if (args?.kind === "list" || args?.kind === "vector") {
    return args.items ?? [];
  }
  return [];
};

const typeName = (value) => {
  if (value?.kind === "string" || value?.kind === "symbol" || value?.kind === "keyword") {
    return value.value;
  }
  if (entryValue(value, ":kind")?.value === "type-ref") {
    const name = entryValue(value, ":name")?.value ?? "Unknown";
    if (name.includes("<")) {
      return name;
    }
    return `Ref<${name}>`;
  }
  if (entryValue(value, ":kind")?.value === "type-project-row") {
    const row = typeName(entryValue(value, ":row")) ?? "Unknown";
    const fields = entryValue(value, ":fields")?.items?.map((item) => item.value) ?? [];
    return `Project<${row}:${fields.join(",")}>`;
  }
  return entryValue(value, ":name")?.value;
};

const preludes = readPreludes();

const requiredPreludeSource = (sourceId) => {
  const entry = preludes.find((candidate) => candidate.sourceId === sourceId);
  if (!entry) {
    throw new Error(`Missing required prelude ${sourceId}`);
  }
  return entry.source;
};

const protocolFieldValue = (source, field) => {
  const match = source.match(new RegExp(`\\(:${field}\\s+([^\\s()\\]]+)`));
  if (!match) {
    throw new Error(`Missing protocol registry field :${field}`);
  }
  return match[1];
};

const viewProtocolSource = requiredPreludeSource("preludes/viewspec-protocol.lisp");
const viewProtocol = {
  compileLayoutTreeOp: protocolFieldValue(viewProtocolSource, "compile-layout-tree-op"),
  hostedDslName: protocolFieldValue(viewProtocolSource, "hosted-dsl-name").replaceAll('"', ""),
  componentExtension: protocolFieldValue(viewProtocolSource, "component-extension"),
  componentProtocolExtension: protocolFieldValue(
    viewProtocolSource,
    "component-protocol-extension",
  ),
  layoutAliasExtension: protocolFieldValue(viewProtocolSource, "layout-alias-extension"),
  actionExtension: protocolFieldValue(viewProtocolSource, "action-extension"),
  exprOpExtension: protocolFieldValue(viewProtocolSource, "expr-op-extension"),
  exprSourceExtension: protocolFieldValue(viewProtocolSource, "expr-source-extension"),
  exprSourceEnum: protocolFieldValue(viewProtocolSource, "expr-source-enum"),
};

const applyProtocolNames = (source, protocol) =>
  source
    .replaceAll("view/compile-layout-tree", protocol.compileLayoutTreeOp)
    .replaceAll('"viewspec"', `"${protocol.hostedDslName}"`)
    .replaceAll(":view/component-protocol", `:${protocol.componentProtocolExtension}`)
    .replaceAll('"view/component"', `"${protocol.componentExtension}"`)
    .replaceAll(":view/component", `:${protocol.componentExtension}`)
    .replaceAll(":view/layout-alias", `:${protocol.layoutAliasExtension}`)
    .replaceAll(":view/action", `:${protocol.actionExtension}`)
    .replaceAll(":view/expr-op", `:${protocol.exprOpExtension}`)
    .replaceAll(":view/expr-source", `:${protocol.exprSourceExtension}`)
    .replaceAll("view/component-protocol", protocol.componentProtocolExtension)
    .replaceAll("view/component", protocol.componentExtension)
    .replaceAll("view/layout-alias", protocol.layoutAliasExtension)
    .replaceAll("view/action", protocol.actionExtension)
    .replaceAll("view/expr-op", protocol.exprOpExtension)
    .replaceAll("view/expr-source", protocol.exprSourceExtension)
    .replaceAll("ViewExprSource", protocol.exprSourceEnum);

const applyViewProtocolNames = (source) => applyProtocolNames(source, viewProtocol);

const syntheticProtocol = {
  compileLayoutTreeOp: "card/compile-tree",
  hostedDslName: "cardspec",
  componentExtension: "card/component",
  componentProtocolExtension: "card/component-protocol",
  layoutAliasExtension: "card/layout-alias",
  actionExtension: "card/action",
  exprOpExtension: "card/expr-op",
  exprSourceExtension: "card/expr-source",
  exprSourceEnum: "CardExprSource",
};

const syntheticProtocolSource = applyProtocolNames(viewProtocolSource, syntheticProtocol);

const querySource = `
(define-query employee-directory
  (:from Employee)
  (:select [employee/name employee/status]))
`;

const entitySource = `
(define-entity Employee
  (:field [employee/name String {:required true}])
  (:field [employee/status String])
  (:field [employee/department (Ref Department)]))
`;

const recordSource = `
(define-record "employee:ada" Employee
  (:field [employee/name "Ada Lovelace"])
  (:field [employee/status "active"])
  (:field [employee/department "department:platform"]))
`;

const cases = [
  {
    name: "entity bindings",
    source: `${entitySource}\n(entity/bindings Employee)`,
    assert(response) {
      const value = response.value;
      const nameBinding = entryValue(value, "$entity:Employee:employee/name");
      const statusBinding = entryValue(value, "$entity:Employee:employee/status");
      const departmentBinding = entryValue(value, "$entity:Employee:employee/department");
      if (
        value?.kind !== "map" ||
        typeName(nameBinding) !== "String" ||
        typeName(statusBinding) !== "String" ||
        typeName(departmentBinding) !== "Ref<Department>"
      ) {
        throw new Error(
          `Unexpected entity/bindings response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "query bindings",
    source: `${entitySource}\n${querySource}\n(query/bindings employee-directory)`,
    assert(response) {
      const value = response.value;
      const queryBinding = entryValue(value, "employee-directory");
      const rowBinding = entryValue(value, "it");
      if (
        value?.kind !== "map" ||
        typeName(queryBinding) !== "QueryDef" ||
        typeName(rowBinding) !== "Row<Employee>"
      ) {
        throw new Error(`Unexpected query/bindings response: ${JSON.stringify(response, null, 2)}`);
      }
    },
  },
  {
    name: "query result type",
    source: `${entitySource}\n${querySource}\n(query/result-type employee-directory)`,
    assert(response) {
      const item = entryValue(response.value, ":item");
      if (
        response.value?.kind !== "map" ||
        entryValue(response.value, ":kind")?.value !== "type-list" ||
        typeName(item) !== "Project<Row<Employee>:employee/name,employee/status>"
      ) {
        throw new Error(
          `Unexpected query/result-type response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "query validation",
    source: `${entitySource}\n${querySource}\n(query/validate employee-directory)`,
    assert(response) {
      if (
        (response.value?.kind !== "list" && response.value?.kind !== "vector") ||
        response.value.items?.length !== 0
      ) {
        throw new Error(`Unexpected query/validate response: ${JSON.stringify(response, null, 2)}`);
      }
    },
  },
  {
    name: "query construct",
    source: `${entitySource}\n${querySource}\n(query/construct employee-directory)`,
    assert(response) {
      const value = response.value;
      const kind = entryValue(value, ":kind");
      const name = entryValue(value, ":name");
      const from = entryValue(value, ":from");
      if (
        value?.kind !== "map" ||
        kind?.value !== "Query" ||
        name?.value !== "employee-directory" ||
        from?.value !== "Employee"
      ) {
        throw new Error(
          `Unexpected query/construct response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "entity construct",
    source: `${entitySource}\n(entity/construct Employee)`,
    assert(response) {
      const value = response.value;
      const kind = entryValue(value, ":kind");
      const name = entryValue(value, ":name");
      const fields = entryValue(value, ":fields");
      const firstField = fields?.items?.[0];
      const secondField = fields?.items?.[1];
      const thirdField = fields?.items?.[2];
      const fieldName = entryValue(firstField, ":name");
      const fieldType = entryValue(firstField, ":type");
      const fieldRequired = entryValue(firstField, ":required");
      const secondRequired = entryValue(secondField, ":required");
      const refType = entryValue(thirdField, ":type");
      if (
        value?.kind !== "map" ||
        kind?.value !== "Entity" ||
        name?.value !== "Employee" ||
        fields?.kind !== "list" ||
        fields.items?.length !== 3 ||
        fieldName?.value !== "employee/name" ||
        fieldType?.value !== "String" ||
        fieldRequired?.value !== "true" ||
        secondRequired?.kind !== "nil" ||
        refType?.kind !== "list" ||
        refType.items?.[0]?.value !== "Ref" ||
        refType.items?.[1]?.value !== "Department"
      ) {
        throw new Error(
          `Unexpected entity/construct response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "record child forms unwrap vector fields",
    source: `${recordSource}
(let [fields (meta/child-forms employee:ada :field)
      first-field (first fields)]
  {:field-count (count fields)
   :field-name (meta/identifier first-field :name)
   :field-value (meta/slot-string first-field :type)})`,
    assert(response) {
      const value = response.value;
      const fieldCount = entryValue(value, ":field-count");
      const fieldName = entryValue(value, ":field-name");
      const fieldValue = entryValue(value, ":field-value");
      if (
        value?.kind !== "map" ||
        fieldCount?.value !== 3 ||
        fieldName?.value !== "employee/name" ||
        fieldValue?.value !== "Ada Lovelace"
      ) {
        throw new Error(
          `Unexpected record child form response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "record construct",
    source: `${recordSource}\n(record/construct employee:ada)`,
    assert(response) {
      const value = response.value;
      const kind = entryValue(value, ":kind");
      const id = entryValue(value, ":id");
      const entity = entryValue(value, ":entity");
      const fields = entryValue(value, ":fields");
      const nameValue = entryValue(fields, "employee/name");
      const statusValue = entryValue(fields, "employee/status");
      const departmentValue = entryValue(fields, "employee/department");
      if (
        value?.kind !== "map" ||
        kind?.value !== "Record" ||
        id?.value !== "employee:ada" ||
        entity?.value !== "Employee" ||
        fields?.kind !== "map" ||
        nameValue?.value !== "Ada Lovelace" ||
        statusValue?.value !== "active" ||
        departmentValue?.value !== "department:platform"
      ) {
        throw new Error(
          `Unexpected record/construct response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "generic meta primitive surface",
    source: `${entitySource}\n${querySource}\n(meta/form-name employee-directory)`,
    assert(response) {
      if (response.value?.value !== "define-query") {
        throw new Error(`Unexpected meta/form-name response: ${JSON.stringify(response, null, 2)}`);
      }
    },
  },
  {
    name: "declaration reflection",
    source:
      `${entitySource}\n` +
      '(let [decl (meta/lookup-declaration nil "Employee") field (meta/declaration-field decl "employee/name")] (construct/object :kind (meta/declaration-kind decl) :type (meta/declaration-type decl) :field field))',
    assert(response) {
      const kind = entryValue(response.value, ":kind");
      const typ = entryValue(response.value, ":type");
      const field = entryValue(response.value, ":field");
      const fieldType = entryValue(field, ":type");
      if (
        response.value?.kind !== "map" ||
        kind?.value !== "Entity" ||
        typeName(typ) !== "Row<Employee>" ||
        typeName(fieldType) !== "String"
      ) {
        throw new Error(
          `Unexpected declaration reflection response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "descriptor extension reflection merges repeated nested clauses",
    source: `
(define-form sample-view
  (:phase meta)
  (:extensions
    (:view/component
      (:type-field type)
      (:props-field props)
      (:children-field children)
      (:children none)
      (:compile
        (:required-children false))
      (:compile
        (:expr-props [visible bind]))
      (:compile
        (:node-slots [footer])))))

(let [ext (meta/descriptor-extension sample-view :view/component)
      compile (get ext :compile)]
  (construct/object
    :children (get ext :children)
    :exprProps (get compile :expr-props)
    :nodeSlots (get compile :node-slots)))
`,
    assert(response) {
      const children = entryValue(response.value, ":children");
      const exprProps = entryValue(response.value, ":exprProps");
      const nodeSlots = entryValue(response.value, ":nodeSlots");
      if (
        response.value?.kind !== "map" ||
        children?.value !== "none" ||
        exprProps?.kind !== "vector" ||
        exprProps.items?.[0]?.value !== "visible" ||
        exprProps.items?.[1]?.value !== "bind" ||
        nodeSlots?.kind !== "vector" ||
        nodeSlots.items?.[0]?.value !== "footer"
      ) {
        throw new Error(
          `Unexpected descriptor extension reflection response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "typed type constructors",
    source:
      '(type/record ["employee/name" (type/constant "String")] ["employee/active" (type/constant "Bool")])',
    assert(response) {
      const kind = entryValue(response.value, ":kind");
      const fields = entryValue(response.value, ":fields");
      const firstField = fields?.items?.[0];
      const firstType = entryValue(firstField, ":type");
      if (
        response.value?.kind !== "map" ||
        kind?.value !== "type-record" ||
        fields?.items?.length !== 2 ||
        typeName(firstType) !== "String"
      ) {
        throw new Error(`Unexpected type/record response: ${JSON.stringify(response, null, 2)}`);
      }
    },
  },
  {
    name: "declarative diagnostics",
    source: `${querySource}\n(diag/require-slot employee-directory :where)`,
    assert(response) {
      const first = response.value?.items?.[0];
      const message = entryValue(first, ":message");
      if (
        response.value?.kind !== "list" ||
        response.value.items?.length !== 1 ||
        message?.value !== "Missing required slot :where"
      ) {
        throw new Error(
          `Unexpected diag/require-slot response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "binding combinators",
    source:
      '(bindings/merge (bindings/from-declaration "employee-directory" (type/constant "QueryDef")) (bindings/when true (bindings/of ["it" (type/ref "Row<Employee>")])))',
    assert(response) {
      const queryBinding = entryValue(response.value, "employee-directory");
      const rowBinding = entryValue(response.value, "it");
      if (
        response.value?.kind !== "map" ||
        typeName(queryBinding) !== "QueryDef" ||
        typeName(rowBinding) !== "Row<Employee>"
      ) {
        throw new Error(
          `Unexpected binding combinators response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "descriptor construct bridge",
    source: `
(define-form sample
  (:identifiers
    (identifier name Symbol (:declaration true)))
  (:slots
    (slot label value))
  (:declaration-type (constant SampleDef))
  (:construct
    [kind "Sample"]
    [name (identifier name)]
    [label (slot label)]
    [loc loc])
  (:construct-fn descriptor-construct)
  (:result-type (constant SampleDef)))

(descriptor-construct (sample sample-one (:label "Hello")))
`,
    assert(response) {
      const kind = entryValue(response.value, ":kind");
      const name = entryValue(response.value, ":name");
      const label = entryValue(response.value, ":label");
      if (
        response.value?.kind !== "map" ||
        kind?.value !== "Sample" ||
        name?.value !== "sample-one" ||
        label?.value !== "Hello"
      ) {
        throw new Error(
          `Unexpected descriptor construct response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "construct from descriptor normalizes input by default",
    source: `
(define-form sample
  (:identifiers
    (identifier name Symbol (:declaration true)))
  (:slots
    (slot label value))
  (:declaration-type (constant SampleDef))
  (:construct
    [kind "Sample"]
    [name (identifier name)]
    [label (slot label)]
    [loc loc])
  (:construct-fn descriptor-construct)
  (:result-type (constant SampleDef)))

(let [input (sample sample-two (:label "World"))]
  (construct/from-descriptor :input input))
`,
    assert(response) {
      const kind = entryValue(response.value, ":kind");
      const name = entryValue(response.value, ":name");
      const label = entryValue(response.value, ":label");
      if (
        response.value?.kind !== "map" ||
        kind?.value !== "Sample" ||
        name?.value !== "sample-two" ||
        label?.value !== "World"
      ) {
        throw new Error(
          `Unexpected construct/from-descriptor default normalization response: ${JSON.stringify(
            response,
            null,
            2,
          )}`,
        );
      }
    },
  },
  {
    name: "generic declaration reflection from descriptor metadata",
    source: `
(define-form sample
  (:identifiers
    (identifier name Symbol (:declaration true)))
  (:slots
    (slot label value))
  (:declaration-type (constant SampleDef))
  (:construct
    [kind "Sample"]
    [name (identifier name)]
    [label (slot label)]
    [loc loc])
  (:construct-fn descriptor-construct)
  (:result-type (constant SampleDef)))

(let [decl (sample sample-one (:label "Hello"))]
  (construct/object
    :kind (meta/declaration-kind decl)
    :type (meta/declaration-type decl)))
`,
    assert(response) {
      const kind = entryValue(response.value, ":kind");
      const typ = entryValue(response.value, ":type");
      if (
        response.value?.kind !== "map" ||
        kind?.value !== "Sample" ||
        typeName(typ) !== "SampleDef"
      ) {
        throw new Error(
          `Unexpected generic declaration reflection response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "generic declaration field reflection from normalized child forms",
    source: `
(define-form sample-schema
  (:identifiers
    (identifier name Symbol (:declaration true)))
  (:slots
    (slot field value
      (:many true)
      (:child-form field)
      (:child-identifier name Value)
      (:child-slot type expr (:positional true))))
  (:declaration-type (constant SampleSchemaDef))
  (:construct
    [kind "SampleSchema"]
    [name (identifier name)]
    [fields (children field)]
    [loc loc])
  (:construct-fn descriptor-construct)
  (:result-type (constant SampleSchemaDef)))

(let [decl (sample-schema Widget
              (:field [widget/name String])
              (:field [widget/enabled Bool]))
      fields (meta/declaration-fields decl)
      first-field (first fields)
      second-field (nth fields 1)]
  (construct/object
    :kind (meta/declaration-kind decl)
    :firstName (meta/declaration-field decl "widget/name")
    :fieldCount (count fields)
    :firstFieldType (get first-field :type)
    :secondFieldType (get second-field :type)))
`,
    assert(response) {
      const kind = entryValue(response.value, ":kind");
      const firstNameField = entryValue(response.value, ":firstName");
      const fieldCount = entryValue(response.value, ":fieldCount");
      const firstFieldType = entryValue(response.value, ":firstFieldType");
      const secondFieldType = entryValue(response.value, ":secondFieldType");
      if (
        response.value?.kind !== "map" ||
        kind?.value !== "SampleSchema" ||
        fieldCount?.value !== 2 ||
        typeName(entryValue(firstNameField, ":type")) !== "String" ||
        typeName(firstFieldType) !== "String" ||
        typeName(secondFieldType) !== "Bool"
      ) {
        throw new Error(
          `Unexpected generic declaration field reflection response: ${JSON.stringify(
            response,
            null,
            2,
          )}`,
        );
      }
    },
  },
  {
    name: "generic child slot reflection from descriptor metadata",
    source: `
(define-form sample-action
  (:identifiers
    (identifier name Symbol (:declaration true)))
  (:slots
    (slot input value
      (:many true)
      (:child-form input)
      (:child-identifier name Value)
      (:child-slot type expr (:positional true))
      (:child-slot required value)))
  (:construct
    [kind "SampleAction"]
    [name (identifier name)]
    [inputs (children input)]
    [loc loc])
  (:construct-fn descriptor-construct)
  (:result-type (constant SampleActionDef)))

(let [decl (sample-action send-email
              (:input [recipient String {:required true}]))
      inp (first (meta/child-forms decl :input))]
  (construct/object
    :name (meta/identifier inp :name)
    :type (meta/slot-value inp :type)
    :required (meta/slot-value inp :required)))
`,
    assert(response) {
      const name = entryValue(response.value, ":name");
      const typ = entryValue(response.value, ":type");
      const required = entryValue(response.value, ":required");
      if (
        response.value?.kind !== "map" ||
        name?.value !== "recipient" ||
        typeName(typ) !== "String" ||
        required?.value !== true
      ) {
        throw new Error(
          `Unexpected generic child slot reflection response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "lookup declaration normalizes reflection input",
    source: `
(define-form sample-schema
  (:identifiers
    (identifier name Symbol (:declaration true)))
  (:slots
    (slot field value
      (:many true)
      (:child-form field)
      (:child-identifier name Value)
      (:child-slot type expr (:positional true))))
  (:declaration-type (constant SampleSchemaDef))
  (:construct
    [kind "SampleSchema"]
    [name (identifier name)]
    [fields (children field)]
    [loc loc])
  (:construct-fn descriptor-construct)
  (:result-type (constant SampleSchemaDef)))

(sample-schema Widget
  (:field [widget/name String])
  (:field [widget/enabled Bool]))

(let [decl (meta/lookup-declaration nil "Widget")]
  (construct/object
    :name (meta/declaration-name decl)
    :form (meta/form-name decl)
    :kind (meta/declaration-kind decl)
    :type (meta/declaration-type decl)
    :fieldCount (count (meta/declaration-fields decl))))
`,
    assert(response) {
      const name = entryValue(response.value, ":name");
      const form = entryValue(response.value, ":form");
      const kind = entryValue(response.value, ":kind");
      const typ = entryValue(response.value, ":type");
      const fieldCount = entryValue(response.value, ":fieldCount");
      if (
        response.value?.kind !== "map" ||
        name?.value !== "Widget" ||
        form?.value !== "sample-schema" ||
        kind?.value !== "SampleSchema" ||
        typeName(typ) !== "SampleSchemaDef" ||
        fieldCount?.value !== 2
      ) {
        throw new Error(
          `Unexpected normalized lookup reflection response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "view layout tree compilation applies hosted aliases",
    source: `
(define-form sample-view
  (:identifiers
    (identifier name Symbol (:declaration true)))
  (:slots
    (slot layout expr))
  (:construct
    [kind "SampleView"]
    [name (identifier name)]
    [loc loc])
  (:construct-fn descriptor-construct)
  (:result-type (constant SampleViewDef)))

(let [decl (sample-view sample-view
              (:layout
                (rows
                  (task-detail {:task-id "task:1"})
                  (component-ref {:name "violation-history"})
                  (card
                    (violation-timeline {:violation-id "vio:1"})
                    (action-form {:action-ref "complete-onboarding" :label "Complete"})))))
      layout-expr (meta/slot-expr decl :layout)]
  (view/compile-layout-tree "view/component" layout-expr))
`,
    assert(response) {
      const root = response.value;
      const children = entryValue(root, ":children")?.items ?? [];
      const [taskDetail, componentRef, card] = children;
      const nestedChildren = entryValue(card, ":children")?.items ?? [];
      const [timeline, actionForm] = nestedChildren;

      if (
        response.value?.kind !== "map" ||
        entryValue(root, ":type")?.value !== "rows" ||
        children.length !== 3 ||
        entryValue(taskDetail, ":type")?.value !== "custom" ||
        entryValue(taskDetail, ":componentName")?.value !== "runtime/task-detail" ||
        entryValue(componentRef, ":type")?.value !== "view-ref" ||
        entryValue(card, ":type")?.value !== "card" ||
        nestedChildren.length !== 2 ||
        entryValue(timeline, ":type")?.value !== "custom" ||
        entryValue(timeline, ":componentName")?.value !== "runtime/violation-timeline" ||
        entryValue(actionForm, ":type")?.value !== "action-button"
      ) {
        throw new Error(
          `Unexpected hosted alias compilation response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "view layout tree compilation applies cond alias from protocol metadata",
    source: `
(define-form sample-view
  (:identifiers
    (identifier name Symbol (:declaration true)))
  (:slots
    (slot layout expr))
  (:construct
    [kind "SampleView"]
    [name (identifier name)]
    [loc loc])
  (:construct-fn descriptor-construct)
  (:result-type (constant SampleViewDef)))

(let [decl (sample-view sample-view
              (:layout
                (cond
                  (case {:when true}
                    (text "Ready")))))
      layout-expr (meta/slot-expr decl :layout)]
  (view/compile-layout-tree "view/component" layout-expr))
`,
    assert(response) {
      const root = response.value;
      const children = entryValue(root, ":children")?.items ?? [];
      const [caseNode] = children;
      const caseChildren = entryValue(caseNode, ":children")?.items ?? [];
      const [textNode] = caseChildren;

      if (
        response.value?.kind !== "map" ||
        entryValue(root, ":type")?.value !== "condition" ||
        children.length !== 1 ||
        entryValue(caseNode, ":type")?.value !== "case" ||
        entryValue(textNode, ":type")?.value !== "text" ||
        entryValue(entryValue(textNode, ":content"), ":value")?.value !== "Ready"
      ) {
        throw new Error(
          `Unexpected cond alias compilation response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "view layout tree compilation",
    source: `
(define-form sample-view
  (:identifiers
    (identifier name Symbol (:declaration true)))
  (:slots
    (slot layout expr))
  (:construct
    [kind "SampleView"]
    [name (identifier name)]
    [loc loc])
  (:construct-fn descriptor-construct)
  (:result-type (constant SampleViewDef)))

(let [decl (sample-view sample-view
              (:layout
                (rows
                  (text "Ready")
                  (action-button {:label "Submit"
                                  :on-click (execute-action "complete-onboarding")})
                  (custom {:component-name "runtime/task-detail"
                           :props {:task-id "task:1"}}))))
      layout-expr (meta/slot-expr decl :layout)]
  (view/compile-layout-tree
    "view/component"
    layout-expr))
`,
    assert(response) {
      const root = response.value;
      const children = entryValue(root, ":children")?.items ?? [];
      const [textNode, actionButton, customNode] = children;
      const textContent = entryValue(textNode, ":content");
      const actionLabel = entryValue(actionButton, ":label");
      const actionEvents = entryValue(actionButton, ":events");
      const onClick = entryValue(actionEvents, ":onClick");
      const customProps = entryValue(customNode, ":props");

      if (
        response.value?.kind !== "map" ||
        entryValue(root, ":type")?.value !== "rows" ||
        children.length !== 3 ||
        entryValue(textNode, ":type")?.value !== "text" ||
        entryValue(textContent, ":kind")?.value !== "literal" ||
        entryValue(textContent, ":value")?.value !== "Ready" ||
        entryValue(actionButton, ":type")?.value !== "action-button" ||
        entryValue(actionLabel, ":kind")?.value !== "literal" ||
        entryValue(actionLabel, ":value")?.value !== "Submit" ||
        entryValue(onClick, ":action")?.value !== "executeAction" ||
        entryValue(onClick, ":actionRef")?.value !== "complete-onboarding" ||
        entryValue(customNode, ":type")?.value !== "custom" ||
        entryValue(customNode, ":componentName")?.value !== "runtime/task-detail" ||
        entryValue(customProps, ":task-id")?.value !== "task:1"
      ) {
        throw new Error(
          `Unexpected view/compile-layout-tree response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "view child policy drops nested children when disabled",
    source: `
(define-form child-node
  (:phase meta)
  (:extensions
    (:view/component
      (:type-field type)
      (:props-field props)
      (:children-field children)
      (:children none))))

(define-form parent-node
  (:phase meta)
  (:extensions
    (:view/component
      (:type-field type)
      (:props-field props)
      (:children-field children)
      (:children none))))

(view/compile-layout-tree
  "view/component"
  '(parent-node
     (child-node)))
`,
    assert(response) {
      const root = response.value;
      const children = entryValue(root, ":children");

      if (
        response.value?.kind !== "map" ||
        entryValue(root, ":type")?.value !== "parent-node" ||
        children != null
      ) {
        throw new Error(
          `Unexpected disabled child policy response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "view child policy filters to allowed child types",
    source: `
(define-form allowed-child
  (:phase meta)
  (:extensions
    (:view/component
      (:type-field type)
      (:props-field props)
      (:children-field children)
      (:children none))))

(define-form blocked-child
  (:phase meta)
  (:extensions
    (:view/component
      (:type-field type)
      (:props-field props)
      (:children-field children)
      (:children none))))

(define-form parent-node
  (:phase meta)
  (:extensions
    (:view/component
      (:type-field type)
      (:props-field props)
      (:children-field children)
      (:children only [allowed-child]))))

(view/compile-layout-tree
  "view/component"
  '(parent-node
     (allowed-child)
     (blocked-child)))
`,
    assert(response) {
      const root = response.value;
      const children = entryValue(root, ":children")?.items ?? [];
      const [firstChild] = children;

      if (
        response.value?.kind !== "map" ||
        entryValue(root, ":type")?.value !== "parent-node" ||
        children.length !== 1 ||
        entryValue(firstChild, ":type")?.value !== "allowed-child"
      ) {
        throw new Error(
          `Unexpected allowed child policy response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "view required children gates compilation",
    source: `
(define-form parent-node
  (:phase meta)
  (:extensions
    (:view/component
      (:type-field type)
      (:props-field props)
      (:children-field children)
      (:children any)
      (:compile
        (:required-children true)))))

(view/compile-layout-tree
  "view/component"
  '(parent-node))
`,
    assert(response) {
      if (response.value?.kind !== "nil") {
        throw new Error(
          `Unexpected required children response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "view parent policy filters children by declared parent types",
    source: `
(define-form restricted-child
  (:phase meta)
  (:extensions
    (:view/component
      (:type-field type)
      (:props-field props)
      (:children-field children)
      (:children none)
      (:parents [allowed-parent]))))

(define-form allowed-parent
  (:phase meta)
  (:extensions
    (:view/component
      (:type-field type)
      (:props-field props)
      (:children-field children)
      (:children any))))

(define-form blocked-parent
  (:phase meta)
  (:extensions
    (:view/component
      (:type-field type)
      (:props-field props)
      (:children-field children)
      (:children any))))

(let [allowed (view/compile-layout-tree
                "view/component"
                '(allowed-parent
                   (restricted-child)))
      blocked (view/compile-layout-tree
                "view/component"
                '(blocked-parent
                   (restricted-child)))]
  (construct/object :allowed allowed :blocked blocked))
`,
    assert(response) {
      const allowed = entryValue(response.value, ":allowed");
      const blocked = entryValue(response.value, ":blocked");
      const allowedChildren = entryValue(allowed, ":children")?.items ?? [];
      const blockedChildren = entryValue(blocked, ":children");
      const [allowedChild] = allowedChildren;

      if (
        response.value?.kind !== "map" ||
        entryValue(allowed, ":type")?.value !== "allowed-parent" ||
        allowedChildren.length !== 1 ||
        entryValue(allowedChild, ":type")?.value !== "restricted-child" ||
        entryValue(blocked, ":type")?.value !== "blocked-parent" ||
        blockedChildren != null
      ) {
        throw new Error(`Unexpected parent policy response: ${JSON.stringify(response, null, 2)}`);
      }
    },
  },
  {
    name: "view child policy uses declared child component type field",
    source: `
(define-form typed-child
  (:phase meta)
  (:extensions
    (:view/component
      (:type-field kind)
      (:props-field props)
      (:children-field children)
      (:children none))))

(define-form typed-parent
  (:phase meta)
  (:extensions
    (:view/component
      (:type-field type)
      (:props-field props)
      (:children-field children)
      (:children (only [typed-child])))))

(view/compile-layout-tree
  "view/component"
  '(typed-parent
     (typed-child)))
`,
    assert(response) {
      const root = response.value;
      const [child] = entryValue(root, ":children")?.items ?? [];

      if (
        response.value?.kind !== "map" ||
        entryValue(root, ":type")?.value !== "typed-parent" ||
        child?.kind !== "map" ||
        entryValue(child, ":kind")?.value !== "typed-child"
      ) {
        throw new Error(
          `Unexpected child type-field policy response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "view required bind synthesizes empty bind expr",
    source: `
(define-form bound-node
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind true)
      (:type-field type)
      (:props-field props)
      (:children-field children)
      (:children none)
      (:compile
        (:expr-props [bind])
        (:required-bind true)))))

(view/compile-layout-tree
  "view/component"
  '(bound-node))
`,
    assert(response) {
      const root = response.value;
      const bind = entryValue(root, ":bind");
      const bindValue = entryValue(bind, ":value");

      if (
        response.value?.kind !== "map" ||
        entryValue(root, ":type")?.value !== "bound-node" ||
        entryValue(bind, ":kind")?.value !== "literal" ||
        !["list", "vector"].includes(bindValue?.kind ?? "") ||
        (bindValue.items?.length ?? -1) !== 0
      ) {
        throw new Error(`Unexpected required bind response: ${JSON.stringify(response, null, 2)}`);
      }
    },
  },
  {
    name: "view bind prop name comes from protocol metadata",
    source: `
(define-form local-view-component-protocol
  (:phase meta)
  (:extensions
    (:view/component-protocol
      (:type-field type)
      (:props-field props)
      (:events-field events)
      (:children-field children)
      (:bind-prop selection)
      (:required-bind-value [])
      (:scalar-fallback-field text)
      (:scalar-fallback-kind value)
      (:unknown-props expr))))

(define-form selectable-node
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind true)
      (:type-field type)
      (:props-field props)
      (:children-field children)
      (:children none)
      (:compile
        (:expr-props [selection])
        (:required-bind true)))))

(view/compile-layout-tree
  "view/component"
  '(selectable-node))
`,
    assert(response) {
      const root = response.value;
      const selection = entryValue(root, ":selection");
      const bind = entryValue(root, ":bind");
      const selectionValue = entryValue(selection, ":value");

      if (
        response.value?.kind !== "map" ||
        entryValue(root, ":type")?.value !== "selectable-node" ||
        bind != null ||
        entryValue(selection, ":kind")?.value !== "literal" ||
        !["list", "vector"].includes(selectionValue?.kind ?? "") ||
        (selectionValue.items?.length ?? -1) !== 0
      ) {
        throw new Error(
          `Unexpected protocol bind prop response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "view required bind payload comes from protocol metadata",
    source: `
(define-form local-view-component-protocol
  (:phase meta)
  (:extensions
    (:view/component-protocol
      (:type-field type)
      (:props-field props)
      (:events-field events)
      (:children-field children)
      (:bind-prop bind)
      (:required-bind-value ["seed"])
      (:scalar-fallback-field text)
      (:scalar-fallback-kind value)
      (:unknown-props expr))))

(define-form bound-node
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind true)
      (:type-field type)
      (:props-field props)
      (:children-field children)
      (:children none)
      (:compile
        (:expr-props [bind])
        (:required-bind true)))))

(view/compile-layout-tree
  "view/component"
  '(bound-node))
`,
    assert(response) {
      const root = response.value;
      const bind = entryValue(root, ":bind");
      const bindValue = entryValue(bind, ":value");
      const [item] = bindValue?.items ?? [];

      if (
        response.value?.kind !== "map" ||
        entryValue(root, ":type")?.value !== "bound-node" ||
        entryValue(bind, ":kind")?.value !== "literal" ||
        !["list", "vector"].includes(bindValue?.kind ?? "") ||
        (bindValue.items?.length ?? -1) !== 1 ||
        item?.kind !== "string" ||
        item?.value !== "seed"
      ) {
        throw new Error(
          `Unexpected protocol bind payload response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "view bind stays in props when component does not allow bind",
    source: `
(define-form plain-node
  (:phase meta)
  (:extensions
    (:view/component
      (:allows-bind false)
      (:type-field type)
      (:props-field props)
      (:children-field children)
      (:children none))))

(view/compile-layout-tree
  "view/component"
  '(plain-node {:bind (query main)}))
`,
    assert(response) {
      const root = response.value;
      const props = entryValue(root, ":props");
      const bind = entryValue(props, ":bind");

      if (
        response.value?.kind !== "map" ||
        entryValue(root, ":type")?.value !== "plain-node" ||
        entryValue(root, ":bind") != null ||
        props?.kind !== "map" ||
        bind?.kind !== "list"
      ) {
        throw new Error(
          `Unexpected disallowed bind response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "view action lowering follows explicit descriptor metadata",
    source: `
(define-form submit-now
  (:phase meta)
  (:extensions
    (:view/action
      (:form submit-now)
      (:discriminator-field action)
      (:tag submitNow)
      (:positional [[token string]]))
    (:protocol/object
      (:name SubmitNowAction)
      (:fields
        (:action (:kind literal) (:values [submitNow]) (:required true))
        (:token (:type string) (:required true))))))

(view/compile-layout-tree
  "view/component"
  '(action-button {:label "Submit"
                   :on-click (submit-now "token:123")}))
`,
    assert(response) {
      const root = response.value;
      const events = entryValue(root, ":events");
      const onClick = entryValue(events, ":onClick");

      if (
        response.value?.kind !== "map" ||
        entryValue(root, ":type")?.value !== "action-button" ||
        entryValue(onClick, ":action")?.value !== "submitNow" ||
        entryValue(onClick, ":token")?.value !== "token:123"
      ) {
        throw new Error(
          `Unexpected explicit action metadata lowering response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "view action keyword inputs follow explicit protocol metadata",
    source: `
(define-form submit-now
  (:phase meta)
  (:extensions
    (:view/action
      (:form submit-now)
      (:discriminator-field action)
      (:tag submitNow)
      (:keywords [[request-id requestId string optional]]))
    (:protocol/object
      (:name SubmitNowAction)
      (:fields
        (:action (:kind literal) (:values [submitNow]) (:required true))
        (:requestId (:type string))))))

(view/compile-layout-tree
  "view/component"
  '(action-button {:label "Submit"
                   :on-click (submit-now (:request-id "req:123"))}))
`,
    assert(response) {
      const root = response.value;
      const events = entryValue(root, ":events");
      const onClick = entryValue(events, ":onClick");

      if (
        response.value?.kind !== "map" ||
        entryValue(root, ":type")?.value !== "action-button" ||
        entryValue(onClick, ":action")?.value !== "submitNow" ||
        entryValue(onClick, ":requestId")?.value !== "req:123" ||
        entryValue(onClick, ":request-id") != null
      ) {
        throw new Error(
          `Unexpected explicit action keyword metadata lowering response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "view component expr props follow explicit compile metadata",
    source: `
(define-form sample-bound
  (:phase meta)
  (:extensions
    (:view/component
      (:type-field type)
      (:props-field props)
      (:children-field children)
      (:children none)
      (:compile
        (:required-children false))
      (:compile
        (:expr-props [visible bind])))))

(view/compile-layout-tree
  "view/component"
  '(sample-bound {:visible (state ready)
                  :bind (query main)}))
`,
    assert(response) {
      const root = response.value;
      const visible = entryValue(root, ":visible");
      const bind = entryValue(root, ":bind");

      if (
        response.value?.kind !== "map" ||
        entryValue(root, ":type")?.value !== "sample-bound" ||
        entryValue(visible, ":kind")?.value !== "var" ||
        entryValue(visible, ":source")?.value !== "state" ||
        entryValue(bind, ":kind")?.value !== "var" ||
        entryValue(bind, ":source")?.value !== "query"
      ) {
        throw new Error(
          `Unexpected explicit component expr props response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "view expr lowering follows explicit operator metadata",
    source: `
(define-form custom-read-expr
  (:phase meta)
  (:extensions
    (:view/expr-op
      (:form read)
      (:lowering get-path))))

(define-form custom-negate-expr
  (:phase meta)
  (:extensions
    (:view/expr-op
      (:form negate)
      (:lowering unary)
      (:op "!"))))

(define-form sample-bound
  (:phase meta)
  (:extensions
    (:view/component
      (:type-field type)
      (:props-field props)
      (:children-field children)
      (:children none)
      (:compile
        (:expr-props [visible count])))))

(view/compile-layout-tree
  "view/component"
  '(sample-bound {:visible (negate (state ready))
                  :count (read (state ready) :count)}))
`,
    assert(response) {
      const root = response.value;
      const visible = entryValue(root, ":visible");
      const count = entryValue(root, ":count");
      const visibleValue = entryValue(visible, ":value");
      const visiblePath = entryValue(visibleValue, ":path");
      const countPath = entryValue(count, ":path");

      if (
        response.value?.kind !== "map" ||
        entryValue(root, ":type")?.value !== "sample-bound" ||
        entryValue(visible, ":kind")?.value !== "unary" ||
        entryValue(visible, ":op")?.value !== "!" ||
        entryValue(visibleValue, ":kind")?.value !== "var" ||
        entryValue(visibleValue, ":source")?.value !== "state" ||
        visiblePath?.kind !== "list" ||
        visiblePath.items?.[0]?.value !== "ready" ||
        entryValue(count, ":kind")?.value !== "var" ||
        entryValue(count, ":source")?.value !== "state" ||
        countPath?.kind !== "list" ||
        countPath.items?.[0]?.value !== "ready" ||
        countPath.items?.[1]?.value !== "count"
      ) {
        throw new Error(
          `Unexpected explicit expr operator response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "view expr conditional and nil comparison follow explicit operator metadata",
    source: `
(define-form custom-missing-expr
  (:phase meta)
  (:extensions
    (:view/expr-op
      (:form missing)
      (:lowering compare-nil))))

(define-form custom-choose-expr
  (:phase meta)
  (:extensions
    (:view/expr-op
      (:form choose)
      (:lowering conditional))))

(define-form sample-bound
  (:phase meta)
  (:extensions
    (:view/component
      (:type-field type)
      (:props-field props)
      (:children-field children)
      (:children none)
      (:compile
        (:expr-props [visible])))))

(view/compile-layout-tree
  "view/component"
  '(sample-bound {:visible (choose (missing (state ready)) "Empty" "Present")}))
`,
    assert(response) {
      const root = response.value;
      const visible = entryValue(root, ":visible");
      const condition = entryValue(visible, ":condition");
      const left = entryValue(condition, ":left");
      const leftPath = entryValue(left, ":path");
      const right = entryValue(condition, ":right");
      const thenExpr = entryValue(visible, ":then");
      const elseExpr = entryValue(visible, ":else");

      if (
        response.value?.kind !== "map" ||
        entryValue(root, ":type")?.value !== "sample-bound" ||
        entryValue(visible, ":kind")?.value !== "conditional" ||
        entryValue(condition, ":kind")?.value !== "binary" ||
        entryValue(condition, ":op")?.value !== "===" ||
        entryValue(left, ":kind")?.value !== "var" ||
        entryValue(left, ":source")?.value !== "state" ||
        leftPath?.kind !== "list" ||
        leftPath.items?.[0]?.value !== "ready" ||
        entryValue(right, ":kind")?.value !== "literal" ||
        entryValue(right, ":value")?.kind !== "nil" ||
        entryValue(thenExpr, ":kind")?.value !== "literal" ||
        entryValue(thenExpr, ":value")?.value !== "Empty" ||
        entryValue(elseExpr, ":kind")?.value !== "literal" ||
        entryValue(elseExpr, ":value")?.value !== "Present"
      ) {
        throw new Error(
          `Unexpected conditional/nil metadata response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "view expr pipe call and pipe chain follow explicit operator metadata",
    source: `
(define-form custom-measure-expr
  (:phase meta)
  (:extensions
    (:view/expr-op
      (:form measure)
      (:lowering pipe-call)
      (:name length))))

(define-form custom-thread-expr
  (:phase meta)
  (:extensions
    (:view/expr-op
      (:form thread)
      (:lowering pipe-chain))))

(define-form sample-bound
  (:phase meta)
  (:extensions
    (:view/component
      (:type-field type)
      (:props-field props)
      (:children-field children)
      (:children none)
      (:compile
        (:expr-props [count threaded])))))

(view/compile-layout-tree
  "view/component"
  '(sample-bound {:count (measure (state items))
                  :threaded (thread (state items) measure)}))
`,
    assert(response) {
      const root = response.value;
      const count = entryValue(root, ":count");
      const countValue = entryValue(count, ":value");
      const countPath = entryValue(countValue, ":path");
      const threaded = entryValue(root, ":threaded");
      const threadedValue = entryValue(threaded, ":value");
      const threadedPath = entryValue(threadedValue, ":path");

      if (
        response.value?.kind !== "map" ||
        entryValue(root, ":type")?.value !== "sample-bound" ||
        entryValue(count, ":kind")?.value !== "pipe" ||
        entryValue(count, ":name")?.value !== "length" ||
        entryValue(countValue, ":kind")?.value !== "var" ||
        entryValue(countValue, ":source")?.value !== "state" ||
        countPath?.kind !== "list" ||
        countPath.items?.[0]?.value !== "items" ||
        entryValue(threaded, ":kind")?.value !== "pipe" ||
        entryValue(threaded, ":name")?.value !== "measure" ||
        entryValue(threadedValue, ":kind")?.value !== "var" ||
        entryValue(threadedValue, ":source")?.value !== "state" ||
        threadedPath?.kind !== "list" ||
        threadedPath.items?.[0]?.value !== "items"
      ) {
        throw new Error(`Unexpected pipe metadata response: ${JSON.stringify(response, null, 2)}`);
      }
    },
  },
  {
    name: "view expr unknown forms fall back to literal values",
    source: `
(define-form sample-bound
  (:phase meta)
  (:extensions
    (:view/component
      (:type-field type)
      (:props-field props)
      (:children-field children)
      (:children none)
      (:compile
        (:expr-props [visible])))))

(view/compile-layout-tree
  "view/component"
  '(sample-bound {:visible (mystery (state ready) :count)}))
`,
    assert(response) {
      const root = response.value;
      const visible = entryValue(root, ":visible");
      const value = entryValue(visible, ":value");
      const nested = value?.items?.[1];

      if (
        response.value?.kind !== "map" ||
        entryValue(root, ":type")?.value !== "sample-bound" ||
        entryValue(visible, ":kind")?.value !== "literal" ||
        value?.kind !== "list" ||
        value.items?.[0]?.value !== "mystery" ||
        nested?.kind !== "list" ||
        nested.items?.[0]?.value !== "state" ||
        nested.items?.[1]?.value !== "ready" ||
        value.items?.[2]?.value !== "count"
      ) {
        throw new Error(
          `Unexpected literal fallback response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "view component slot aliases come from normalized descriptor slots",
    source: `
(define-form aliased-button
  (:phase meta)
  (:extensions
    (:view/component
      (:type-field type)
      (:props-field props)
      (:children-field children)
      (:children none)))
  (:slots
    (slot label expr (:alias text))))

(view/compile-layout-tree
  "view/component"
  '(aliased-button {:text "Close"}))
`,
    assert(response) {
      const root = response.value;
      const label = entryValue(root, ":label");
      if (
        response.value?.kind !== "map" ||
        entryValue(root, ":type")?.value !== "aliased-button" ||
        entryValue(root, ":props") != null ||
        entryValue(label, ":kind")?.value !== "literal" ||
        entryValue(label, ":value")?.value !== "Close"
      ) {
        throw new Error(
          `Unexpected aliased slot routing response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "view bind and visible are ordinary props without expr metadata",
    source: `
(define-form sample-plain
  (:phase meta)
  (:extensions
    (:view/component
      (:type-field type)
      (:props-field props)
      (:children-field children)
      (:children none))))

(view/compile-layout-tree
  "view/component"
  '(sample-plain {:visible (state ready)
                  :bind (query main)}))
`,
    assert(response) {
      const root = response.value;
      const props = entryValue(root, ":props");
      const visible = entryValue(props, ":visible");
      const bind = entryValue(props, ":bind");

      if (
        response.value?.kind !== "map" ||
        entryValue(root, ":type")?.value !== "sample-plain" ||
        entryValue(root, ":visible") != null ||
        entryValue(root, ":bind") != null ||
        visible?.kind !== "list" ||
        bind?.kind !== "list"
      ) {
        throw new Error(
          `Unexpected undeclared bind/visible fallback response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "view component events follow explicit descriptor metadata",
    source: `
(define-form submit-now
  (:phase meta)
  (:extensions
    (:view/action
      (:form submit-now)
      (:discriminator-field action)
      (:tag submitNow)
      (:positional [[token string]]))
    (:protocol/object
      (:name SubmitNowAction)
      (:fields
        (:action (:kind literal) (:values [submitNow]) (:required true))
        (:token (:type string) (:required true))))))

(define-form save-button
  (:phase meta)
  (:extensions
    (:view/component
      (:type-field type)
      (:props-field props)
      (:children-field children)
      (:children none)
      (:events {:after-save onSuccess})
      (:events-field events))))

(view/compile-layout-tree
  "view/component"
  '(save-button {:after-save (submit-now "token:123")}))
`,
    assert(response) {
      const root = response.value;
      const events = entryValue(root, ":events");
      const onSuccess = entryValue(events, ":onSuccess");

      if (
        response.value?.kind !== "map" ||
        entryValue(root, ":type")?.value !== "save-button" ||
        entryValue(onSuccess, ":action")?.value !== "submitNow" ||
        entryValue(onSuccess, ":token")?.value !== "token:123"
      ) {
        throw new Error(
          `Unexpected explicit component event mapping response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "view component event arrays derive normalized event field names",
    source: `
(define-form submit-now
  (:phase meta)
  (:extensions
    (:view/action
      (:form submit-now)
      (:discriminator-field action)
      (:tag submitNow)
      (:positional [[token string]]))
    (:protocol/object
      (:name SubmitNowAction)
      (:fields
        (:action (:kind literal) (:values [submitNow]) (:required true))
        (:token (:type string) (:required true))))))

(define-form save-button
  (:phase meta)
  (:extensions
    (:view/component
      (:type-field type)
      (:props-field props)
      (:children-field children)
      (:children none)
      (:events [after-save])
      (:events-field events))))

(view/compile-layout-tree
  "view/component"
  '(save-button {:after-save (submit-now "token:123")}))
`,
    assert(response) {
      const root = response.value;
      const events = entryValue(root, ":events");
      const afterSave = entryValue(events, ":afterSave");

      if (
        response.value?.kind !== "map" ||
        entryValue(root, ":type")?.value !== "save-button" ||
        entryValue(afterSave, ":action")?.value !== "submitNow" ||
        entryValue(afterSave, ":token")?.value !== "token:123"
      ) {
        throw new Error(`Unexpected event array response: ${JSON.stringify(response, null, 2)}`);
      }
    },
  },
  {
    name: "view component event normalization follows source-local protocol override",
    source: `
(define-form local-view-component-protocol
  (:phase meta)
  (:extensions
    (:view/component-protocol
      (:prop-name-normalization preserve)
      (:type-field type)
      (:props-field props)
      (:events-field events)
      (:children-field children)
      (:bind-prop bind)
      (:required-bind-value [])
      (:scalar-fallback-field text)
      (:scalar-fallback-kind value)
      (:unknown-props json))))

(define-form submit-now
  (:phase meta)
  (:extensions
    (:view/action
      (:form submit-now)
      (:discriminator-field action)
      (:tag submitNow)
      (:positional [[token string]]))
    (:protocol/object
      (:name SubmitNowAction)
      (:fields
        (:action (:kind literal) (:values [submitNow]) (:required true))
        (:token (:type string) (:required true))))))

(define-form save-button
  (:phase meta)
  (:extensions
    (:view/component
      (:type-field type)
      (:props-field props)
      (:children-field children)
      (:children none)
      (:events [after-save])
      (:events-field events))))

(view/compile-layout-tree
  "view/component"
  '(save-button {:after-save (submit-now "token:123")}))
`,
    assert(response) {
      const root = response.value;
      const events = entryValue(root, ":events");
      const afterSave = entryValue(events, ":afterSave");
      const afterSaveKebab = entryValue(events, ":after-save");

      if (
        response.value?.kind !== "map" ||
        entryValue(root, ":type")?.value !== "save-button" ||
        afterSave != null ||
        entryValue(afterSaveKebab, ":action")?.value !== "submitNow" ||
        entryValue(afterSaveKebab, ":token")?.value !== "token:123"
      ) {
        throw new Error(
          `Unexpected source-local event normalization response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "view positional props require declared slots",
    source: `
(define-form title-only
  (:phase meta)
  (:extensions
    (:view/component
      (:type-field type)
      (:props-field props)
      (:children-field children)
      (:children none)
      (:positional-prop title))))

(view/compile-layout-tree
  "view/component"
  '(title-only "Hello"))
`,
    assert(response) {
      const root = response.value;

      if (
        response.value?.kind !== "map" ||
        entryValue(root, ":type")?.value !== "title-only" ||
        entryValue(root, ":title") != null
      ) {
        throw new Error(
          `Unexpected positional prop without slot response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "view scalar fallback field follows protocol metadata",
    source: `
(define-form plain-node
  (:phase meta)
  (:extensions
    (:view/component
      (:type-field type)
      (:props-field props)
      (:children-field children)
      (:children none))))

(view/compile-layout-tree
  "view/component"
  '(plain-node "Hello"))
`,
    assert(response) {
      const root = response.value;
      const text = entryValue(root, ":text");

      if (
        response.value?.kind !== "map" ||
        entryValue(root, ":type")?.value !== "plain-node" ||
        text?.value !== "Hello"
      ) {
        throw new Error(
          `Unexpected scalar fallback response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "view scalar fallback kind follows source-local protocol override",
    source: `
(define-form local-view-component-protocol
  (:phase meta)
  (:extensions
    (:view/component-protocol
      (:type-field type)
      (:props-field props)
      (:events-field events)
      (:children-field children)
      (:bind-prop bind)
      (:required-bind-value [])
      (:scalar-fallback-field content)
      (:scalar-fallback-kind expr)
      (:unknown-props json))))

(define-form plain-node
  (:phase meta)
  (:extensions
    (:view/component
      (:type-field type)
      (:props-field props)
      (:children-field children)
      (:children none))))

(view/compile-layout-tree
  "view/component"
  '(plain-node $row))
`,
    assert(response) {
      const root = response.value;
      const content = entryValue(root, ":content");

      if (
        response.value?.kind !== "map" ||
        entryValue(root, ":type")?.value !== "plain-node" ||
        entryValue(root, ":text") != null ||
        entryValue(content, ":kind")?.value !== "var" ||
        entryValue(content, ":source")?.value !== "row"
      ) {
        throw new Error(
          `Unexpected scalar fallback override response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "view unknown prop routing follows source-local protocol override",
    source: `
(define-form local-view-component-protocol
  (:phase meta)
  (:extensions
    (:view/component-protocol
      (:type-field type)
      (:props-field attrs)
      (:events-field events)
      (:children-field children)
      (:bind-prop bind)
      (:required-bind-value [])
      (:scalar-fallback-field text)
      (:scalar-fallback-kind value)
      (:unknown-props expr))))

(define-form plain-node
  (:phase meta)
  (:extensions
    (:view/component
      (:type-field type)
      (:props-field attrs)
      (:children-field children)
      (:children none))))

(view/compile-layout-tree
  "view/component"
  '(plain-node {:mystery $row}))
`,
    assert(response) {
      const root = response.value;
      const attrs = entryValue(root, ":attrs");
      const mystery = entryValue(attrs, ":mystery");

      if (
        response.value?.kind !== "map" ||
        entryValue(root, ":type")?.value !== "plain-node" ||
        entryValue(root, ":props") != null ||
        attrs?.kind !== "map" ||
        entryValue(mystery, ":kind")?.value !== "var" ||
        entryValue(mystery, ":source")?.value !== "row"
      ) {
        throw new Error(
          `Unexpected unknown prop override response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "view component unknown-props kind overrides protocol fallback",
    source: `
(define-form local-view-component-protocol
  (:phase meta)
  (:extensions
    (:view/component-protocol
      (:type-field type)
      (:props-field attrs)
      (:events-field events)
      (:children-field children)
      (:bind-prop bind)
      (:required-bind-value [])
      (:scalar-fallback-field text)
      (:scalar-fallback-kind value)
      (:unknown-props expr))))

(define-form plain-node
  (:phase meta)
  (:extensions
      (:view/component
        (:type-field type)
        (:props-field attrs)
        (:children-field children)
        (:children none)
        (:compile
        (:unknown-props json)))))

(view/compile-layout-tree
  "view/component"
  '(plain-node {:mystery $row}))
`,
    assert(response) {
      const root = response.value;
      const attrs = entryValue(root, ":attrs");
      const mystery = entryValue(attrs, ":mystery");

      if (
        response.value?.kind !== "map" ||
        entryValue(root, ":type")?.value !== "plain-node" ||
        attrs?.kind !== "map" ||
        mystery?.kind !== "string" ||
        mystery?.value !== "$row" ||
        entryValue(mystery, ":kind") != null
      ) {
        throw new Error(
          `Unexpected component unknown-props override response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "view component compile metadata overrides fields and events",
    source: `
(define-form submit-now
  (:phase meta)
  (:extensions
    (:view/action
      (:form submit-now)
      (:discriminator-field action)
      (:tag submitNow))
    (:protocol/object
      (:name SubmitNowAction)
      (:fields
        (:action (:kind literal) (:values [submitNow]) (:required true))))))

(define-form save-button
  (:phase meta)
  (:slots
    (slot title expr))
  (:extensions
    (:view/component
      (:type-field type)
      (:props-field props)
      (:children-field children)
      (:children none)
      (:events {:after-save onSuccess})
      (:compile
        (:fields {:title headingText})
        (:events {:after-save afterSave}))
      (:events-field events))))

(view/compile-layout-tree
  "view/component"
  '(save-button {:title "Save" :after-save (submit-now)}))
`,
    assert(response) {
      const root = response.value;
      const events = entryValue(root, ":events");
      const afterSave = entryValue(events, ":afterSave");
      const headingText = entryValue(root, ":headingText");

      if (
        response.value?.kind !== "map" ||
        entryValue(root, ":type")?.value !== "save-button" ||
        entryValue(headingText, ":kind")?.value !== "literal" ||
        entryValue(headingText, ":value")?.value !== "Save" ||
        entryValue(root, ":title") != null ||
        entryValue(afterSave, ":action")?.value !== "submitNow" ||
        entryValue(events, ":onSuccess") != null
      ) {
        throw new Error(
          `Unexpected compile metadata override response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "view component field override values stay explicit",
    source: `
(define-form plain-node
  (:phase meta)
  (:slots
    (slot title expr))
  (:extensions
    (:view/component
      (:type-field type)
      (:props-field props)
      (:children-field children)
      (:children none)
      (:compile
        (:fields {:title heading-text})))))

(view/compile-layout-tree
  "view/component"
  '(plain-node {:title "Hello"}))
`,
    assert(response) {
      const root = response.value;
      const headingText = entryValue(root, ":heading-text");
      const camelHeading = entryValue(root, ":headingText");

      if (
        response.value?.kind !== "map" ||
        entryValue(root, ":type")?.value !== "plain-node" ||
        entryValue(headingText, ":kind")?.value !== "literal" ||
        entryValue(headingText, ":value")?.value !== "Hello" ||
        camelHeading != null
      ) {
        throw new Error(
          `Unexpected explicit field override response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "protocol runtime supports non-view protocol names",
    source: `
${syntheticProtocolSource}

(define-form card-title
  (:phase meta)
  (:extensions
    (:card/component
      (:type-field type)
      (:props-field props)
      (:children-field children)
      (:children none))))

(card/compile-tree
  "cardspec"
  "card/component"
  '(card-title "Hello"))
`,
    assert(response) {
      const root = response.value;
      const text = entryValue(root, ":text");

      if (
        root?.kind !== "map" ||
        entryValue(root, ":type")?.value !== "card-title" ||
        text?.value !== "Hello"
      ) {
        throw new Error(
          `Unexpected non-view protocol response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
  {
    name: "protocol assembly supports non-view aliases and actions",
    source: `
${syntheticProtocolSource}

(define-form submit-card
  (:phase meta)
  (:extensions
    (:card/action
      (:form submit-card)
      (:discriminator-field action)
      (:tag submitCard)
      (:positional [[token string]]))
    (:protocol/object
      (:name SubmitCardAction)
      (:fields
        (:action (:kind literal) (:values [submitCard]) (:required true))
        (:token (:type string) (:required true))))))

(define-form primary-button
  (:phase meta)
  (:extensions
    (:card/component
      (:type-field type)
      (:props-field props)
      (:children-field children)
      (:children none)
      (:events [on-press])
      (:events-field events))))

(define-form card-cta
  (:phase meta)
  (:extensions
    (:card/layout-alias
      (:form card-cta)
      (:to primary-button))))

(card/compile-tree
  "cardspec"
  "card/component"
  '(card-cta {:label "Go" :on-press (submit-card "token:abc")}))
`,
    assert(response) {
      const root = response.value;
      const props = entryValue(root, ":props");
      const label = entryValue(props, ":label");
      const events = entryValue(root, ":events");
      const onPress = entryValue(events, ":onPress");

      if (
        root?.kind !== "map" ||
        entryValue(root, ":type")?.value !== "primary-button" ||
        props?.kind !== "map" ||
        label?.value !== "Go" ||
        entryValue(onPress, ":action")?.value !== "submitCard" ||
        entryValue(onPress, ":token")?.value !== "token:abc"
      ) {
        throw new Error(
          `Unexpected non-view protocol alias/action response: ${JSON.stringify(response, null, 2)}`,
        );
      }
    },
  },
];

let sessionId;
let hardFailure;
const failures = [];

try {
  const opened = await request({ op: "openSession" });
  expectOk("openSession", opened);
  sessionId = opened.value.sessionId;

  for (const prelude of preludes) {
    const response = await request({
      op: "loadPrelude",
      sessionId,
      ...prelude,
    });
    expectOk(`loadPrelude ${prelude.sourceId}`, response);
  }

  for (const testCase of cases) {
    const response = await request({
      op: "evaluate",
      sessionId,
      sourceId: `meta-hooks/${testCase.name}`,
      source: applyViewProtocolNames(testCase.source),
    });

    try {
      expectOk(testCase.name, response);
      testCase.assert(response);
    } catch (error) {
      failures.push({
        name: testCase.name,
        response,
        error: String(error),
      });
    }
  }
} catch (error) {
  hardFailure = error;
} finally {
  if (sessionId) {
    try {
      await request({ op: "closeSession", sessionId });
    } catch {
      // The daemon may already be closing after an earlier hard failure.
    }
  }
  daemon.stdin.end();
}

const exitCode = await new Promise((resolveExit) => daemon.on("close", resolveExit));
if (exitCode !== 0) {
  throw new Error(`Daemon exited with ${exitCode}: ${stderr}`);
}

if (hardFailure) {
  console.error(`language-ocaml meta hook check failed: ${hardFailure.message}`);
  process.exit(1);
}

if (failures.length > 0) {
  console.error(`language-ocaml meta hook failures: ${failures.length}/${cases.length}`);
  for (const failure of failures) {
    console.error(JSON.stringify(failure, null, 2));
  }
  process.exit(1);
}

console.log(`language-ocaml meta hooks ok (${cases.length} cases)`);
