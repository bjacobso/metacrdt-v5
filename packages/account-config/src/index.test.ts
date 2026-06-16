import { describe, expect, it } from "vitest";
import {
  applyAccountDeploy,
  approveAccountDeploy,
  accountConfigResourceGraph,
  accountConfigResourceGraphToMermaid,
  accountConfigSourceNavigationItems,
  accountConfigSourceOutline,
  accountDeployArtifact,
  accountConfigManifest,
  accountConfigFromFormaSource,
  accountConfigToFormaSource,
  deployAccountIfMain,
  dumpAccountDeploy,
  planAccountDeploy,
  parseFormaAccountConfigSource,
  validateAccountConfig,
  validateFormaAccountConfigSource,
} from "./index";

const CONFIG = {
  account: { slug: "legal-workflows", name: "Legal Workflows", kind: "legal" },
  attributes: [
    { name: "matter.status", valueType: "string", cardinality: "one" },
    { name: "client", valueType: "entityRef", cardinality: "one" },
  ],
  entityTypes: [
    {
      name: "Matter",
      attributes: ["name", "matter.status", "client"],
      description: "A legal matter.",
    },
  ],
  forms: [
    {
      form: "conflict_check",
      title: "Conflict Check",
      fields: [{ name: "cleared", label: "Conflict cleared", type: "boolean" }],
    },
  ],
  flows: [
    {
      name: "matter_intake",
      title: "Matter intake",
      subjectType: "Matter",
      startStepId: "done",
      steps: [{ id: "done", type: "done" }],
    },
  ],
  requirements: [{ form: "conflict_check", scopeAttr: "client" }],
  actions: [
    {
      name: "close_matter",
      appliesTo: "Matter",
      asserts: { "matter.status": "closed" },
    },
  ],
};

describe("@metacrdt/account-config", () => {
  it("validates account config references", () => {
    expect(validateAccountConfig(CONFIG)).toEqual([]);

    expect(
      validateAccountConfig({
        account: { slug: "", name: "", kind: "bad" },
        attributes: [
          {
            name: "matter.status",
            valueType: "string",
            cardinality: "one",
            description: 1,
          },
        ],
        entityTypes: [{ name: "Matter", attributes: ["missing.attr"], description: false }],
        forms: [
          {
            form: "intake",
            title: "Intake",
            description: 1,
            fields: [
              { name: "choice", label: "Choice", type: "select" },
              {
                name: "bad_option",
                label: "Bad option",
                type: "select",
                options: ["ok", 1],
              },
              {
                name: "ignored_options",
                label: "Ignored options",
                type: "string",
                options: ["x"],
              },
              {
                name: "bad_description",
                label: "Bad description",
                type: "string",
                description: 1,
              },
              {
                name: "bad_default",
                label: "Bad default",
                type: "select",
                options: ["ok"],
                defaultValue: "missing",
              },
              {
                name: "bad_number_default",
                label: "Bad number default",
                type: "number",
                defaultValue: "many",
              },
              {
                name: "bad_boolean_default",
                label: "Bad boolean default",
                type: "boolean",
                defaultValue: "true",
              },
              {
                name: "bad_string_default",
                label: "Bad string default",
                type: "string",
                defaultValue: false,
              },
              {
                name: "bad_date_default",
                label: "Bad date default",
                type: "date",
                defaultValue: false,
              },
            ],
          },
        ],
        flows: [
          {
            name: "bad_flow",
            description: false,
            subjectType: "Matter",
            startStepId: "route",
            steps: [
              {
                id: "route",
                type: "branch",
                config: { ifTrue: "missing_step", ifFalse: "done", subjectVar: 1 },
              },
              {
                id: "collect",
                type: "collect",
                config: {
                  form: "missing_form",
                  scopeFrom: "missing.scope",
                  reminderSeconds: "soon",
                },
              },
              { id: "assert", type: "assert", config: { a: "missing.attr", v: "x" } },
              {
                id: "action",
                type: "action",
                config: { resultAttr: "missing.attr", delaySeconds: "later" },
              },
              {
                id: "notify",
                type: "notify",
                config: { message: 1, channel: 2, to: false, template: [], delaySeconds: "later" },
              },
              { id: "wait", type: "wait", config: { seconds: "soon" } },
              { id: "mystery", type: "unknown" },
              { id: "done", type: "done" },
            ],
          },
        ],
        requirements: [
          {
            form: "intake",
            scopeAttr: "client",
            validityDays: "soon",
            description: 1,
          },
        ],
        actions: [
          {
            name: "close",
            appliesTo: "Matter",
            description: false,
            fields: [
              { name: "decision", type: "select", options: [] },
              { name: "comment", type: "string", options: ["ignored"] },
              { name: "private", label: "Private", type: "string", pii: true },
              { name: "count", label: "Count", type: "number", required: "yes" },
              {
                name: "bad_default",
                label: "Bad default",
                type: "select",
                options: ["ok"],
                defaultValue: "missing",
              },
              {
                name: "bad_number_default",
                label: "Bad number default",
                type: "number",
                defaultValue: "many",
              },
              {
                name: "bad_boolean_default",
                label: "Bad boolean default",
                type: "boolean",
                defaultValue: "true",
              },
              {
                name: "bad_string_default",
                label: "Bad string default",
                type: "string",
                defaultValue: false,
              },
              {
                name: "bad_help",
                label: "Bad help",
                type: "string",
                description: false,
              },
            ],
            asserts: { "matter.status": "closed" },
            opensForm: { form: "intake", scope: "missing.scope" },
          },
          {
            name: "collect",
            appliesTo: "Matter",
            opensForm: { form: "intake", scope: "$arg.missing" },
            asserts: {},
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        "account missing slug",
        "account missing name",
        "account kind must be staffing, legal, or custom",
        "attribute matter.status description must be a string",
        "entityType Matter description must be a string",
        "entityType Matter references unknown attribute missing.attr",
        "form intake description must be a string",
        "form intake field choice select field must define non-empty options",
        "form intake field bad_option select field has non-string option",
        "form intake field ignored_options options are only valid for select fields",
        "form intake field bad_description description must be a string",
        "form intake field bad_default defaultValue must be one of its options",
        "form intake field bad_number_default defaultValue must be a number",
        "form intake field bad_boolean_default defaultValue must be a boolean",
        "form intake field bad_string_default defaultValue must be a string",
        "form intake field bad_date_default defaultValue must be a string",
        "flow bad_flow description must be a string",
        "flow bad_flow step route ifTrue references unknown step missing_step",
        "flow bad_flow step route subjectVar must be a string",
        "flow bad_flow step collect collects unknown form missing_form",
        "flow bad_flow step collect scopeFrom references unknown attribute missing.scope",
        "flow bad_flow step collect reminderSeconds must be a number",
        "flow bad_flow step assert asserts unknown attribute missing.attr",
        "flow bad_flow step action resultAttr references unknown attribute missing.attr",
        "flow bad_flow step action delaySeconds must be a number",
        "flow bad_flow step notify notify message must be a string",
        "flow bad_flow step notify channel must be a string",
        "flow bad_flow step notify to must be a string",
        "flow bad_flow step notify template must be a string",
        "flow bad_flow step notify delaySeconds must be a number",
        "flow bad_flow step wait seconds must be a number",
        "flow bad_flow step mystery has invalid type",
        "requirement intake references unknown scopeAttr client",
        "requirement intake validityDays must be a number",
        "requirement intake description must be a string",
        "action close description must be a string",
        "action close field decision missing label",
        "action close field decision select field must define non-empty options",
        "action close field comment missing label",
        "action close field comment options are only valid for select fields",
        "action close field private pii is only valid for form fields",
        "action close field count required must be a boolean",
        "action close field bad_default defaultValue must be one of its options",
        "action close field bad_number_default defaultValue must be a number",
        "action close field bad_boolean_default defaultValue must be a boolean",
        "action close field bad_string_default defaultValue must be a string",
        "action close field bad_help description must be a string",
        "action close opensForm scope references unknown attribute missing.scope",
        "action collect opensForm scope references unknown action field missing",
      ]),
    );
  });

  it("suggests close matches for unknown account config references", () => {
    expect(
      validateAccountConfig({
        ...CONFIG,
        entityTypes: [{ name: "Matter", attributes: ["matter.staus", "clinet"] }],
        flows: [
          {
            name: "matter_intake",
            subjectType: "Mattr",
            startStepId: "collec",
            steps: [
              {
                id: "collect",
                type: "collect",
                next: "don",
                config: {
                  form: "conflict_chek",
                  scopeFrom: "clinet",
                },
              },
              {
                id: "route",
                type: "branch",
                config: {
                  where: [["?s", "matter.staus", "pending"]],
                  ifTrue: "collect",
                  ifFalse: "done",
                },
              },
              { id: "done", type: "done" },
            ],
          },
        ],
        requirements: [
          {
            form: "conflict_chek",
            scopeAttr: "clinet",
            guard: ["matter.staus", "open"],
          },
        ],
        actions: [
          {
            name: "close_matter",
            appliesTo: "Mattr",
            fields: [{ name: "assignee", label: "Assignee", type: "string" }],
            asserts: { "matter.staus": "closed" },
            opensForm: { form: "conflict_chek", scope: "$arg.assigne" },
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        "entityType Matter references unknown attribute matter.staus. Did you mean matter.status?",
        "entityType Matter references unknown attribute clinet. Did you mean client?",
        "flow matter_intake references unknown subjectType Mattr. Did you mean Matter?",
        "flow matter_intake startStepId is not a step. Did you mean collect?",
        "flow matter_intake step collect next references unknown step don. Did you mean done?",
        "flow matter_intake step collect collects unknown form conflict_chek. Did you mean conflict_check?",
        "flow matter_intake step collect scopeFrom references unknown attribute clinet. Did you mean client?",
        "flow matter_intake step route where clause 1 references unknown attribute matter.staus. Did you mean matter.status?",
        "requirement references unknown form conflict_chek. Did you mean conflict_check?",
        "requirement conflict_chek references unknown scopeAttr clinet. Did you mean client?",
        "requirement conflict_chek guard references unknown attribute matter.staus. Did you mean matter.status?",
        "action close_matter references unknown appliesTo Mattr. Did you mean Matter?",
        "action close_matter asserts unknown attribute matter.staus. Did you mean matter.status?",
        "action close_matter opens unknown form conflict_chek. Did you mean conflict_check?",
        "action close_matter opensForm scope references unknown action field assigne. Did you mean assignee?",
      ]),
    );
  });

  it("suggests close matches for invalid account config enum values", () => {
    expect(
      validateAccountConfig({
        ...CONFIG,
        account: { slug: "legal-workflows", name: "Legal Workflows", kind: "legl" },
        attributes: [
          { name: "matter.status", valueType: "strng", cardinality: "one" },
          { name: "client", valueType: "entity-ref", cardinality: "one" },
        ],
        forms: [
          {
            form: "conflict_check",
            title: "Conflict Check",
            fields: [{ name: "cleared", label: "Conflict cleared", type: "booleen" }],
          },
        ],
        flows: [
          {
            name: "matter_intake",
            subjectType: "Matter",
            startStepId: "collect",
            steps: [{ id: "collect", type: "colect" }],
          },
        ],
        actions: [
          {
            name: "close_matter",
            appliesTo: "Matter",
            fields: [{ name: "decision", label: "Decision", type: "selekt" }],
            asserts: { "matter.status": "closed" },
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        "account kind must be staffing, legal, or custom. Did you mean legal?",
        "attribute matter.status has invalid valueType. Did you mean string?",
        "attribute client has invalid valueType. Did you mean entityRef?",
        "form conflict_check field cleared has invalid type. Did you mean boolean?",
        "flow matter_intake step collect has invalid type. Did you mean collect?",
        "action close_matter field decision has invalid type. Did you mean select?",
      ]),
    );
  });

  it("validates matching form field types for declared attributes", () => {
    const configWithTypedFields = {
      ...CONFIG,
      attributes: [
        { name: "matter.status", valueType: "string", cardinality: "one" },
        { name: "client", valueType: "entityRef", cardinality: "one" },
        { name: "approved", valueType: "boolean", cardinality: "one" },
        { name: "risk.score", valueType: "number", cardinality: "one" },
        { name: "review.date", valueType: "date", cardinality: "one" },
      ],
      forms: [
        {
          form: "conflict_check",
          title: "Conflict Check",
          fields: [
            {
              name: "matter.status",
              label: "Matter status",
              type: "select",
              options: ["open", "closed"],
            },
            { name: "approved", label: "Approved", type: "boolean" },
            { name: "risk.score", label: "Risk score", type: "number" },
            { name: "review.date", label: "Review date", type: "date" },
            { name: "evidence.note", label: "Evidence note", type: "string" },
          ],
        },
      ],
    };

    expect(validateAccountConfig(configWithTypedFields)).toEqual([]);
    expect(
      validateAccountConfig({
        ...configWithTypedFields,
        forms: [
          {
            form: "conflict_check",
            title: "Conflict Check",
            fields: [
              { name: "matter.status", label: "Matter status", type: "boolean" },
              { name: "approved", label: "Approved", type: "string" },
              {
                name: "risk.score",
                label: "Risk score",
                type: "select",
                options: ["low", "high"],
              },
              { name: "review.date", label: "Review date", type: "string" },
            ],
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        "form conflict_check field matter.status type must match matter.status attribute valueType string",
        "form conflict_check field approved type must match approved attribute valueType boolean",
        "form conflict_check field risk.score type must match risk.score attribute valueType number",
        "form conflict_check field review.date type must match review.date attribute valueType date",
      ]),
    );
  });

  it("validates matching action field types for declared attributes", () => {
    const configWithTypedActionFields = {
      ...CONFIG,
      attributes: [
        { name: "matter.status", valueType: "string", cardinality: "one" },
        { name: "client", valueType: "entityRef", cardinality: "one" },
        { name: "approved", valueType: "boolean", cardinality: "one" },
        { name: "risk.score", valueType: "number", cardinality: "one" },
        { name: "review.date", valueType: "date", cardinality: "one" },
      ],
      actions: [
        {
          name: "close_matter",
          appliesTo: "Matter",
          fields: [
            {
              name: "matter.status",
              label: "Matter status",
              type: "select",
              options: ["open", "closed"],
            },
            { name: "client", label: "Client", type: "string" },
            { name: "approved", label: "Approved", type: "boolean" },
            { name: "risk.score", label: "Risk score", type: "number" },
            { name: "review.date", label: "Review date", type: "string" },
            { name: "review.note", label: "Review note", type: "string" },
          ],
        },
      ],
    };

    expect(validateAccountConfig(configWithTypedActionFields)).toEqual([]);
    expect(
      validateAccountConfig({
        ...configWithTypedActionFields,
        actions: [
          {
            name: "close_matter",
            appliesTo: "Matter",
            fields: [
              { name: "matter.status", label: "Matter status", type: "boolean" },
              { name: "client", label: "Client", type: "number" },
              { name: "approved", label: "Approved", type: "string" },
              {
                name: "risk.score",
                label: "Risk score",
                type: "select",
                options: ["low", "high"],
              },
              { name: "review.date", label: "Review date", type: "boolean" },
            ],
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        "action close_matter field matter.status type must match matter.status attribute valueType string",
        "action close_matter field client type must match client attribute valueType entityRef",
        "action close_matter field approved type must match approved attribute valueType boolean",
        "action close_matter field risk.score type must match risk.score attribute valueType number",
        "action close_matter field review.date type must match review.date attribute valueType date",
      ]),
    );
  });

  it("validates attribute literal values against declared value types", () => {
    const typedConfig = {
      ...CONFIG,
      attributes: [
        { name: "matter.status", valueType: "string", cardinality: "one" },
        { name: "client", valueType: "entityRef", cardinality: "one" },
        { name: "approved", valueType: "boolean", cardinality: "one" },
        { name: "risk.score", valueType: "number", cardinality: "one" },
        { name: "review.date", valueType: "date", cardinality: "one" },
        { name: "payload", valueType: "json", cardinality: "one" },
      ],
      entityTypes: [
        {
          name: "Matter",
          attributes: [
            "matter.status",
            "client",
            "approved",
            "risk.score",
            "review.date",
            "payload",
          ],
        },
      ],
      flows: [
        {
          name: "matter_intake",
          title: "Matter intake",
          subjectType: "Matter",
          startStepId: "route",
          steps: [
            {
              id: "route",
              type: "branch",
              config: {
                where: [["?s", "risk.score", 3]],
                ifTrue: "approve",
                ifFalse: "done",
              },
            },
            { id: "approve", type: "assert", config: { a: "approved", v: true }, next: "score" },
            {
              id: "score",
              type: "action",
              config: { resultAttr: "risk.score", resultValue: 5 },
              next: "done",
            },
            { id: "done", type: "done" },
          ],
        },
      ],
      requirements: [
        { form: "conflict_check", scopeAttr: "client", guard: ["approved", true] },
      ],
      actions: [
        {
          name: "close_matter",
          appliesTo: "Matter",
          asserts: {
            "matter.status": "closed",
            client: "client:acme",
            approved: false,
            "risk.score": 2,
            "review.date": "2026-01-01",
            payload: { reviewed: true },
          },
        },
      ],
    };
    expect(validateAccountConfig(typedConfig)).toEqual([]);

    expect(
      validateAccountConfig({
        ...typedConfig,
        flows: [
          {
            name: "matter_intake",
            title: "Matter intake",
            subjectType: "Matter",
            startStepId: "route",
            steps: [
              {
                id: "route",
                type: "branch",
                config: {
                  where: [["?s", "risk.score", "high"]],
                  ifTrue: "approve",
                  ifFalse: "done",
                },
              },
              { id: "approve", type: "assert", config: { a: "approved", v: "true" }, next: "score" },
              {
                id: "score",
                type: "action",
                config: { resultAttr: "risk.score", resultValue: "5" },
                next: "done",
              },
              { id: "done", type: "done" },
            ],
          },
        ],
        requirements: [
          { form: "conflict_check", scopeAttr: "client", guard: ["approved", "true"] },
        ],
        actions: [
          {
            name: "close_matter",
            appliesTo: "Matter",
            asserts: {
              "matter.status": false,
              client: 123,
              approved: "false",
              "risk.score": "2",
              "review.date": 20260101,
            },
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        "flow matter_intake step route where clause 1 value for risk.score must be a number",
        "flow matter_intake step approve assert value for approved must be a boolean",
        "flow matter_intake step score action value for risk.score must be a number",
        "requirement conflict_check guard value for approved must be a boolean",
        "action close_matter assert value for matter.status must be a string",
        "action close_matter assert value for client must be a string",
        "action close_matter assert value for approved must be a boolean",
        "action close_matter assert value for risk.score must be a number",
        "action close_matter assert value for review.date must be a string",
      ]),
    );
  });

  it("extracts a stable account manifest", () => {
    expect(accountConfigManifest(CONFIG)).toEqual({
      attributes: ["client", "matter.status"],
      entityTypes: ["Matter"],
      forms: ["conflict_check"],
      flows: ["matter_intake"],
      requirements: ["conflict_check"],
      actions: ["close_matter"],
    });
  });

  it("dumps a stable account deploy artifact", () => {
    const dump = dumpAccountDeploy(CONFIG);

    expect(dump).toMatchObject({
      version: 1,
      source: {
        format: "account-config-ir",
        diagnostics: [],
        account: {
          slug: "legal-workflows",
          name: "Legal Workflows",
          kind: "legal",
        },
        manifest: {
          attributes: ["client", "matter.status"],
        },
      },
      prepared: {
        artifact: {
          kind: "metacrdt.account.deploy",
          version: 1,
          account: {
            slug: "legal-workflows",
          },
          resources: {
            forms: {
              conflict_check: {
                title: "Conflict Check",
              },
            },
          },
        },
      },
    });
    expect(dump.source.digest).toMatch(/^cyrb53:/);
    expect(dump.prepared.digest).toMatch(/^cyrb53:/);
    expect(dump.prepared.digest).toBe(dumpAccountDeploy(CONFIG).prepared.digest);
  });

  it("carries resource descriptions through Forma and deploy artifacts", () => {
    const source = `
(tenant legal-workflows "Legal Workflows" legal)
(entity Matter "A legal matter."
  (attr "matter.status" string "Current lifecycle state.")
  (attr client entityRef)
  (form conflict_check "Conflict Check"
    (description "Collects conflict clearance evidence.")
    (field cleared boolean "Conflict cleared"))
  (flow matter_intake "Matter intake"
    (description "Guides matter intake from conflict check to opening.")
    (start done)
    (step done (done)))
  (requirement conflict_check client 30
    (description "Conflict checks expire monthly."))
  (action close_matter "Close matter"
    (description "Records the matter close decision.")
    (assert "matter.status" closed)))
`;

    const parsed = accountConfigFromFormaSource(source);
    const normalized = accountConfigToFormaSource(parsed);
    const roundTrip = accountConfigFromFormaSource(normalized);
    const artifact = accountDeployArtifact(roundTrip);

    expect(validateAccountConfig(parsed)).toEqual([]);
    expect(roundTrip).toMatchObject({
      forms: [
        {
          form: "conflict_check",
          description: "Collects conflict clearance evidence.",
        },
      ],
      flows: [
        {
          name: "matter_intake",
          description: "Guides matter intake from conflict check to opening.",
        },
      ],
      requirements: [
        {
          form: "conflict_check",
          description: "Conflict checks expire monthly.",
        },
      ],
      actions: [
        {
          name: "close_matter",
          description: "Records the matter close decision.",
        },
      ],
    });
    expect(normalized).toContain(
      '(form "conflict_check" "Conflict Check" "Collects conflict clearance evidence."',
    );
    expect(normalized).toContain(
      '(flow "matter_intake" "Matter intake" "Guides matter intake from conflict check to opening."',
    );
    expect(normalized).toContain(
      '(requires "client" 30 "Conflict checks expire monthly.")',
    );
    expect(normalized).toContain(
      '(action "close_matter" "Close matter" "Records the matter close decision."',
    );
    expect(artifact.resources.forms).toMatchObject({
      conflict_check: {
        description: "Collects conflict clearance evidence.",
      },
    });
    expect(artifact.resources.flows).toMatchObject({
      matter_intake: {
        description: "Guides matter intake from conflict check to opening.",
      },
    });
    expect(artifact.resources.requirements).toMatchObject({
      conflict_check: {
        description: "Conflict checks expire monthly.",
      },
    });
    expect(artifact.resources.actions).toMatchObject({
      close_matter: {
        description: "Records the matter close decision.",
      },
    });
  });

  it("plans an initial account deployment from a prepared artifact", () => {
    const desired = accountDeployArtifact(CONFIG);
    const plan = planAccountDeploy(null, desired);

    expect(plan.valid).toBe(true);
    expect(plan.empty).toBe(false);
    expect(plan.destructive).toBe(false);
    expect(plan.currentArtifactDigest).toBeNull();
    expect(plan.desiredArtifactDigest).toMatch(/^cyrb53:/);
    expect(plan.byKind.attribute.added).toEqual(["client", "matter.status"]);
    expect(plan.byKind.entityType.added).toEqual(["Matter"]);
    expect(plan.totals.form.added).toBe(1);
    expect(plan.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "form",
          name: "conflict_check",
          action: "added",
        }),
      ]),
    );
  });

  it("plans account deployment changes and dangerous removals", () => {
    const current = accountDeployArtifact(CONFIG);
    const desired = accountDeployArtifact({
      ...CONFIG,
      attributes: [
        { name: "matter.status", valueType: "string", cardinality: "many" },
      ],
      requirements: [],
    });

    const plan = planAccountDeploy(current, desired);

    expect(plan.empty).toBe(false);
    expect(plan.destructive).toBe(true);
    expect(plan.byKind.attribute.changed).toEqual(["matter.status"]);
    expect(plan.byKind.attribute.removed).toEqual(["client"]);
    expect(plan.byKind.requirement.removed).toEqual(["conflict_check"]);
    expect(plan.dangerous).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "attribute",
          value: "client",
        }),
        expect.objectContaining({
          kind: "requirement",
          value: "conflict_check",
        }),
      ]),
    );
  });

  it("plans account metadata-only deployment changes", () => {
    const current = accountDeployArtifact(CONFIG);
    const desired = accountDeployArtifact({
      ...CONFIG,
      account: {
        slug: "legal-workflows",
        name: "Legal Operations",
        kind: "legal",
      },
    });

    const plan = planAccountDeploy(current, desired);

    expect(plan.valid).toBe(true);
    expect(plan.empty).toBe(false);
    expect(plan.destructive).toBe(false);
    expect(plan.accountChange).toMatchObject({
      action: "changed",
      before: { slug: "legal-workflows", name: "Legal Workflows", kind: "legal" },
      after: { slug: "legal-workflows", name: "Legal Operations", kind: "legal" },
      changedFields: ["name"],
    });
    for (const diff of Object.values(plan.byKind)) {
      expect(diff.added).toEqual([]);
      expect(diff.changed).toEqual([]);
      expect(diff.removed).toEqual([]);
    }
  });

  it("builds source outline groups with account and grouped requirement locations", () => {
    const source = `(tenant legal-workflows "Legal Workflows" legal)
(attr client entityRef)
(form conflict_check "Conflict Check" "Collects conflict evidence."
  (fields
    (field cleared boolean "Conflict cleared" (required)))
  (requirements
    (requires (scope client) "Client-scoped conflict check.")))
(flow matter_intake Matter "Matter intake" "Collects conflict evidence." done
  (steps
    (done)))
(action close_matter Matter "Close matter"
  (asserts
    (assert "matter.status" closed)))
`;
    const parsed = parseFormaAccountConfigSource(source);

    expect(parsed.config).not.toBeNull();
    const outline = accountConfigSourceOutline(parsed.config, source);

    expect(outline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "account",
          label: "Account",
          items: [
            expect.objectContaining({
              name: "legal-workflows",
              detail: "Legal Workflows / legal",
              line: 1,
            }),
          ],
        }),
        expect.objectContaining({
          kind: "form",
          items: [
            expect.objectContaining({
              name: "conflict_check",
              detail: "1 field / Collects conflict evidence.",
              line: 3,
            }),
          ],
        }),
        expect.objectContaining({
          kind: "requirement",
          items: [
            expect.objectContaining({
              name: "conflict_check",
              detail: "scope client / Client-scoped conflict check.",
              line: 7,
            }),
          ],
        }),
      ]),
    );
    const requirement = outline
      .find((group) => group.kind === "requirement")
      ?.items.find((item) => item.name === "conflict_check");
    expect(source.split("\n")[requirement!.line! - 1]).toContain("(requires (scope client)");

    const navigation = accountConfigSourceNavigationItems(outline, source);
    expect(navigation).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "requirement:conflict_check:7",
          label: "Requirements: conflict_check",
          line: 7,
          detail: "scope client / Client-scoped conflict check.",
          sourceLine: '(requires (scope client) "Client-scoped conflict check.")))',
        }),
      ]),
    );
  });

  it("builds resource graph edges from account config IR", () => {
    const graph = accountConfigResourceGraph({
      ...CONFIG,
      flows: [
        {
          ...CONFIG.flows[0],
          startStepId: "collect",
          steps: [
            {
              id: "collect",
              type: "collect",
              config: { form: "conflict_check", scopeFrom: "client" },
              next: "done",
            },
            { id: "done", type: "done" },
          ],
        },
      ],
      requirements: [
        {
          ...CONFIG.requirements[0],
          guard: ["matter.status", "pending"],
        },
      ],
      actions: [
        {
          ...CONFIG.actions[0],
          opensForm: { form: "conflict_check", scope: "client" },
        },
      ],
    });

    expect(graph).toEqual(
      expect.arrayContaining([
        {
          fromKind: "entityType",
          fromName: "Matter",
          relation: "attribute",
          toKind: "attribute",
          toName: "matter.status",
        },
        {
          fromKind: "entityType",
          fromName: "Matter",
          relation: "flow",
          toKind: "flow",
          toName: "matter_intake",
        },
        {
          fromKind: "entityType",
          fromName: "Matter",
          relation: "action",
          toKind: "action",
          toName: "close_matter",
        },
        {
          fromKind: "flow",
          fromName: "matter_intake",
          relation: "collect",
          toKind: "form",
          toName: "conflict_check",
        },
        {
          fromKind: "flow",
          fromName: "matter_intake",
          relation: "scope",
          toKind: "attribute",
          toName: "client",
        },
        {
          fromKind: "requirement",
          fromName: "conflict_check",
          relation: "scope",
          toKind: "attribute",
          toName: "client",
        },
        {
          fromKind: "requirement",
          fromName: "conflict_check",
          relation: "guard",
          toKind: "attribute",
          toName: "matter.status",
        },
        {
          fromKind: "action",
          fromName: "close_matter",
          relation: "opens",
          toKind: "form",
          toName: "conflict_check",
        },
        {
          fromKind: "action",
          fromName: "close_matter",
          relation: "scope",
          toKind: "attribute",
          toName: "client",
        },
        {
          fromKind: "action",
          fromName: "close_matter",
          relation: "asserts",
          toKind: "attribute",
          toName: "matter.status",
        },
      ]),
    );
  });

  it("renders resource graph edges as Mermaid", () => {
    const graph = accountConfigResourceGraph(CONFIG);
    const mermaid = accountConfigResourceGraphToMermaid(graph, {
      account: CONFIG.account,
    });

    expect(mermaid).toContain("graph LR");
    expect(mermaid).toContain("%% account: Legal Workflows / legal-workflows");
    expect(mermaid).toContain('entityType_Matter["entityType: Matter"]:::entityType');
    expect(mermaid).toContain(
      'entityType_Matter -- "attribute" --> attribute_matter_status',
    );
    expect(mermaid).toContain(
      'entityType_Matter -- "flow" --> flow_matter_intake',
    );
    expect(mermaid).toContain("classDef action");

    const collisionSafeMermaid = accountConfigResourceGraphToMermaid([
      {
        fromKind: "entityType",
        fromName: "Thing",
        relation: "attribute",
        toKind: "attribute",
        toName: "a.b",
      },
      {
        fromKind: "entityType",
        fromName: "Thing",
        relation: "attribute",
        toKind: "attribute",
        toName: "a_b",
      },
    ]);
    expect(collisionSafeMermaid).toContain('attribute_a_b["attribute: a.b"]');
    expect(collisionSafeMermaid).toContain('attribute_a_b_2["attribute: a_b"]');
  });

  it("reports invalid deployment artifacts in local deploy plans", () => {
    const plan = planAccountDeploy(
      {
        ...accountDeployArtifact(CONFIG),
        kind: "wrong" as "metacrdt.account.deploy",
      },
      accountDeployArtifact(CONFIG),
    );

    expect(plan.valid).toBe(false);
    expect(plan.errors).toEqual([
      "current artifact kind must be metacrdt.account.deploy",
    ]);
  });

  it("skips code-first deploys when the module is not the entrypoint", async () => {
    const events: unknown[] = [];
    const result = await deployAccountIfMain(
      { url: "file:///module.ts" },
      CONFIG,
      {
        mainModuleUrl: "file:///other.ts",
        write: (event) => {
          events.push(event);
        },
      },
    );

    expect(result).toEqual({
      skipped: true,
      reason: "module is not the deploy entrypoint",
    });
    expect(events).toEqual([
      { type: "skipped", reason: "module is not the deploy entrypoint" },
    ]);
  });

  it("runs code-first deploy as a local dump and plan entrypoint", async () => {
    const events: { type: string }[] = [];
    const result = await deployAccountIfMain(
      { url: "file:///deploy.ts" },
      CONFIG,
      {
        mainModuleUrl: "file:///deploy.ts",
        currentArtifact: null,
        write: (event) => {
          events.push(event);
        },
      },
    );

    expect(result.skipped).toBe(false);
    if (result.skipped) throw new Error("expected deploy to run");
    expect(result.dump.prepared.digest).toMatch(/^cyrb53:/);
    expect(result.localPlan.empty).toBe(false);
    expect(result.localPlan.byKind.form.added).toEqual(["conflict_check"]);
    expect(events.map((event) => event.type)).toEqual(["dumped", "planned"]);
  });

  it("can delegate code-first deploy plan, approve, and apply to a host", async () => {
    const current = accountDeployArtifact(CONFIG);
    const calls: string[] = [];
    const result = await deployAccountIfMain(
      { url: "file:///deploy.ts" },
      CONFIG,
      {
        isMain: true,
        tenantSlug: "legal-workflows",
        sourceFormat: "forma",
        currentArtifact: async () => current,
        plan: async (input) => {
          calls.push(`plan:${input.tenantSlug}:${input.sourceFormat}`);
          expect(input.localPlan.empty).toBe(true);
          return { planId: "plan1", artifactDigest: input.artifactDigest };
        },
        approve: async (remotePlan) => {
          calls.push(`approve:${(remotePlan as { planId: string }).planId}`);
          return { status: "approved" };
        },
        apply: async (remotePlan, approval) => {
          calls.push(
            `apply:${(remotePlan as { planId: string }).planId}:${(approval as { status: string }).status}`,
          );
          return { status: "applied" };
        },
        autoApprove: true,
        autoApply: true,
      },
    );

    expect(result.skipped).toBe(false);
    if (result.skipped) throw new Error("expected deploy to run");
    expect(calls).toEqual([
      "plan:legal-workflows:forma",
      "approve:plan1",
      "apply:plan1:approved",
    ]);
    expect(result.remotePlan).toEqual({
      planId: "plan1",
      artifactDigest: result.dump.prepared.digest,
    });
    expect(result.approval).toEqual({ status: "approved" });
    expect(result.applyResult).toEqual({ status: "applied" });
  });

  it("applies a runtime deployment plan through a host adapter", async () => {
    const events: unknown[] = [];
    const result = await applyAccountDeploy(
      { tenantSlug: "legal-workflows" },
      " plan1 ",
      {
        applyPlan: async (input) => ({
          status: "applied",
          tenantSlug: input.tenantSlug,
          planId: input.planId,
          approval: input.approval,
        }),
        write: async (event) => {
          events.push(event);
        },
      },
      { approvedBy: "principal:alice" },
    );

    expect(result).toEqual({
      status: "applied",
      tenantSlug: "legal-workflows",
      planId: "plan1",
      approval: { approvedBy: "principal:alice" },
    });
    expect(events).toEqual([{ type: "applied", result }]);
  });

  it("approves a runtime deployment plan through a host adapter", async () => {
    const events: unknown[] = [];
    const result = await approveAccountDeploy(
      "legal-workflows",
      " plan1 ",
      {
        approvePlan: async (input) => ({
          status: "approved",
          tenantSlug: input.tenantSlug,
          planId: input.planId,
        }),
        write: async (event) => {
          events.push(event);
        },
      },
    );

    expect(result).toEqual({
      status: "approved",
      tenantSlug: "legal-workflows",
      planId: "plan1",
    });
    expect(events).toEqual([{ type: "approved", approval: result }]);
  });

  it("rejects runtime deployment apply without a plan id", async () => {
    await expect(
      applyAccountDeploy("legal-workflows", " ", {
        applyPlan: async () => ({ status: "applied" }),
      }),
    ).rejects.toThrow(/plan id is required/);
  });

  it("rejects runtime deployment approval without a plan id", async () => {
    await expect(
      approveAccountDeploy("legal-workflows", " ", {
        approvePlan: async () => ({ status: "approved" }),
      }),
    ).rejects.toThrow(/plan id is required/);
  });

  it("parses Forma account config source into the shared IR", () => {
    const source = `
(account (slug "legal-workflows") (name "Legal Workflows") (kind legal))
(attribute "matter.status" (value-type string) (cardinality one))
(attribute client (value-type entityRef) (cardinality one))
(entity-type Matter (attributes ["name" "matter.status" client]))
(form conflict_check
  (title "Conflict Check")
  (field cleared (label "Conflict cleared") (type boolean) (required true) (description "Visible to reviewers"))
  (field decision select "Decision" ["approve" "reject"] (default-value approve)))
(flow matter_intake
  (subject-type Matter)
  (start done)
  (step done (type done)))
(requirement conflict_check (scope-attr client))
(action close_matter
  (applies-to Matter)
  (field reason select "Reason" ["settled" "withdrawn"] (required false) (default-value settled) (help "Why this matter is closing"))
  (field scope string "Scope")
  (opens-form conflict_check "$arg.scope")
  (assert "matter.status" closed))
`;

    const parsed = accountConfigFromFormaSource(source);

    expect(validateAccountConfig(parsed)).toEqual([]);
    expect(parsed).toMatchObject({
      account: { slug: "legal-workflows", name: "Legal Workflows", kind: "legal" },
      forms: [
        {
          form: "conflict_check",
          fields: [
            {
              name: "cleared",
              label: "Conflict cleared",
              type: "boolean",
              required: true,
              description: "Visible to reviewers",
            },
            {
              name: "decision",
              label: "Decision",
              type: "select",
              options: ["approve", "reject"],
              defaultValue: "approve",
            },
          ],
        },
      ],
      actions: [
        {
          name: "close_matter",
          fields: [
            {
              name: "reason",
              label: "Reason",
              type: "select",
              options: ["settled", "withdrawn"],
              required: false,
              defaultValue: "settled",
              description: "Why this matter is closing",
            },
            {
              name: "scope",
              label: "Scope",
              type: "string",
            },
          ],
          opensForm: { form: "conflict_check", scope: "$arg.scope" },
          asserts: { "matter.status": "closed" },
        },
      ],
    });
  });

  it("parses Forma tenant metadata as account metadata", () => {
    const parsed = accountConfigFromFormaSource(`
(tenant (slug "acme-staffing") (name "Acme Staffing") (kind staffing))
(entity Worker (attr "worker.status" (value-type string) (cardinality one)))
`);

    expect(validateAccountConfig(parsed)).toEqual([]);
    expect(parsed).toMatchObject({
      account: {
        slug: "acme-staffing",
        name: "Acme Staffing",
        kind: "staffing",
      },
      entityTypes: [{ name: "Worker", attributes: ["worker.status"] }],
    });
  });

  it("parses compact Forma entity authoring into attributes and entity types", () => {
    const source = `
(account (slug "legal-workflows") (name "Legal Workflows") (kind legal))
(entity Matter
  (description "A legal matter.")
  (attr "matter.status" (value-type string) (cardinality one) (description "Current lifecycle state."))
  (attr client (value-type entityRef))
  (attr name))
(form conflict_check
  (title "Conflict Check")
  (field cleared (label "Conflict cleared") (type boolean)))
(requirement conflict_check (scope-attr client))
(action close_matter
  (applies-to Matter)
  (assert "matter.status" closed))
`;

    const parsed = accountConfigFromFormaSource(source);

    expect(validateAccountConfig(parsed)).toEqual([]);
    expect(parsed).toMatchObject({
      attributes: [
        {
          name: "matter.status",
          valueType: "string",
          cardinality: "one",
          description: "Current lifecycle state.",
        },
        {
          name: "client",
          valueType: "entityRef",
          cardinality: "one",
        },
      ],
      entityTypes: [
        {
          name: "Matter",
          attributes: ["matter.status", "client", "name"],
          description: "A legal matter.",
        },
      ],
    });
  });

  it("parses positional Forma attribute and field shorthands", () => {
    const source = `
(tenant (slug "acme-staffing") (name "Acme Staffing") (kind staffing))
(attr role string "Job role.")
(entity Worker
  (attr "worker.status" string one "Worker lifecycle state.")
  (attr employer entityRef)
  (attr name)
  (form i9
    (title "Form I-9")
    (field ssn string "SSN" "Social security number." (required) (pii))
    (field citizenship select "Citizenship" ["citizen" "authorized_alien"] "Work authorization status." (required true))))
`;

    const parsed = accountConfigFromFormaSource(source);
    const normalized = accountConfigToFormaSource(parsed);

    expect(validateAccountConfig(parsed)).toEqual([]);
    expect(normalized).toContain('(attr "role" "string" "Job role.")');
    expect(parsed).toMatchObject({
      attributes: [
        {
          name: "role",
          valueType: "string",
          cardinality: "one",
          description: "Job role.",
        },
        {
          name: "worker.status",
          valueType: "string",
          cardinality: "one",
          description: "Worker lifecycle state.",
        },
        {
          name: "employer",
          valueType: "entityRef",
          cardinality: "one",
        },
      ],
      forms: [
        {
          form: "i9",
          fields: [
            {
              name: "ssn",
              label: "SSN",
              type: "string",
              description: "Social security number.",
              required: true,
              pii: true,
            },
            {
              name: "citizenship",
              label: "Citizenship",
              type: "select",
              description: "Work authorization status.",
              required: true,
              options: ["citizen", "authorized_alien"],
            },
          ],
        },
      ],
    });
  });

  it("parses Forma help aliases for attributes and entity types", () => {
    const source = `
(tenant legal-workflows "Legal Workflows" legal)
(attr priority string (help "Priority classification."))
(entity-type AuditRecord ["name"] (help "A system audit record."))
(entity Matter
  (help "A legal matter.")
  (attr "matter.status" string (help "Matter lifecycle state."))
  (attr client entityRef))
`;

    const parsed = accountConfigFromFormaSource(source);
    const normalized = accountConfigToFormaSource(parsed);

    expect(validateAccountConfig(parsed)).toEqual([]);
    expect(parsed).toMatchObject({
      attributes: [
        {
          name: "priority",
          valueType: "string",
          cardinality: "one",
          description: "Priority classification.",
        },
        {
          name: "matter.status",
          valueType: "string",
          cardinality: "one",
          description: "Matter lifecycle state.",
        },
        {
          name: "client",
          valueType: "entityRef",
          cardinality: "one",
        },
      ],
      entityTypes: [
        {
          name: "AuditRecord",
          attributes: ["name"],
          description: "A system audit record.",
        },
        {
          name: "Matter",
          attributes: ["matter.status", "client"],
          description: "A legal matter.",
        },
      ],
    });
    expect(normalized).toContain('(attr "priority" "string" "Priority classification.")');
    expect(normalized).toContain('(entity "AuditRecord" ["name"] "A system audit record.")');
    expect(normalized).toContain('(entity "Matter" "A legal matter."');
    expect(normalized).toContain('(attr "matter.status" "string" "Matter lifecycle state.")');
    expect(normalized).not.toContain("(help ");
  });

  it("parses positional Forma metadata shorthands", () => {
    const source = `
(tenant acme-staffing "Acme Staffing" staffing)
(entity Worker "A staffed worker."
  (attr "worker.status" string "Worker lifecycle state.")
  (attr employer entityRef)
  (form i9 "Form I-9" "Employment eligibility verification."
    (field ssn string "SSN" (required)))
  (flow onboarding "Worker onboarding" "Collect required worker onboarding forms."
    (start i9)
    (step i9 (collect i9 (scope-from employer)) (next done))
    (step done (done)))
  (requirement i9 employer))
`;

    const parsed = accountConfigFromFormaSource(source);

    expect(validateAccountConfig(parsed)).toEqual([]);
    expect(parsed).toMatchObject({
      account: { slug: "acme-staffing", name: "Acme Staffing", kind: "staffing" },
      attributes: [
        {
          name: "worker.status",
          valueType: "string",
          cardinality: "one",
          description: "Worker lifecycle state.",
        },
        {
          name: "employer",
          valueType: "entityRef",
          cardinality: "one",
        },
      ],
      entityTypes: [
        {
          name: "Worker",
          description: "A staffed worker.",
          attributes: ["worker.status", "employer"],
        },
      ],
      forms: [
        {
          form: "i9",
          title: "Form I-9",
          description: "Employment eligibility verification.",
          fields: [{ name: "ssn", type: "string", label: "SSN", required: true }],
        },
      ],
      flows: [
        {
          name: "onboarding",
          title: "Worker onboarding",
          description: "Collect required worker onboarding forms.",
          subjectType: "Worker",
          startStepId: "i9",
        },
      ],
      requirements: [{ form: "i9", scopeAttr: "employer" }],
    });
  });

  it("parses top-level compact Forma flow subject shorthands", () => {
    const source = `
(tenant legal-workflows "Legal Workflows" legal)
(attribute "matter.status" string)
(attribute client entityRef)
(entity-type Matter ["matter.status" client])
(form conflict_check "Conflict Check"
  (field cleared boolean "Conflict cleared"))
(flow matter_intake "Matter" "Matter intake" "Routes a matter through conflict review." conflict
  (step conflict (collect conflict_check client) open)
  (step open (assert "matter.status" open) done)
  (step done (done)))
`;

    const parsed = accountConfigFromFormaSource(source);
    const normalized = accountConfigToFormaSource(parsed);

    expect(validateAccountConfig(parsed)).toEqual([]);
    expect(parsed).toMatchObject({
      flows: [
        {
          name: "matter_intake",
          subjectType: "Matter",
          title: "Matter intake",
          description: "Routes a matter through conflict review.",
          startStepId: "conflict",
          steps: [
            {
              id: "conflict",
              type: "collect",
              config: { form: "conflict_check", scopeFrom: "client" },
              next: "open",
            },
            {
              id: "open",
              type: "assert",
              config: { a: "matter.status", v: "open" },
              next: "done",
            },
            { id: "done", type: "done" },
          ],
        },
      ],
    });
    expect(normalized).toContain(
      '(flow "matter_intake" "Matter intake" "Routes a matter through conflict review." "conflict"',
    );
    expect(normalized).not.toContain("(subject-type ");
  });

  it("parses positional Forma entity-type attributes", () => {
    const parsed = accountConfigFromFormaSource(`
(tenant legal-workflows "Legal Workflows" legal)
(attribute "matter.status" string)
(attribute client entityRef)
(entity-type Matter ["matter.status" client] "A legal matter.")
`);

    expect(validateAccountConfig(parsed)).toEqual([]);
    expect(accountConfigManifest(parsed)).toMatchObject({
      attributes: ["client", "matter.status"],
      entityTypes: ["Matter"],
    });
    expect(parsed).toMatchObject({
      entityTypes: [
        {
          name: "Matter",
          attributes: ["matter.status", "client"],
          description: "A legal matter.",
        },
      ],
    });
  });

  it("parses positional Forma entity attribute vectors", () => {
    const parsed = accountConfigFromFormaSource(`
(tenant legal-workflows "Legal Workflows" legal)
(attr "matter.status" string)
(attr client entityRef)
(entity Matter ["matter.status" client name] "A legal matter.")
(entity Client "A represented client." [name])
`);

    expect(validateAccountConfig(parsed)).toEqual([]);
    expect(parsed).toMatchObject({
      entityTypes: [
        {
          name: "Matter",
          attributes: ["matter.status", "client", "name"],
          description: "A legal matter.",
        },
        {
          name: "Client",
          attributes: ["name"],
          description: "A represented client.",
        },
      ],
    });
  });

  it("normalizes reference-only compact entities with positional attribute vectors", () => {
    const source = accountConfigToFormaSource({
      account: { slug: "legal-workflows", name: "Legal Workflows", kind: "legal" },
      attributes: [],
      entityTypes: [
        {
          name: "AuditRecord",
          attributes: ["name", "type"],
          description: "A runtime audit record.",
        },
      ],
      forms: [],
      flows: [],
      requirements: [],
      actions: [],
    });

    expect(source).toContain('(entity "AuditRecord" ["name" "type"] "A runtime audit record.")');
    expect(source).not.toContain('(attr "name")');
    expect(source).not.toContain('(attr "type")');
    expect(validateFormaAccountConfigSource(source)).toEqual([]);
    expect(accountConfigFromFormaSource(source)).toMatchObject({
      entityTypes: [
        {
          name: "AuditRecord",
          attributes: ["name", "type"],
          description: "A runtime audit record.",
        },
      ],
    });
  });

  it("parses account-config wrapped Forma source bundles", () => {
    const source = `
(account-config
  (tenant legal-workflows "Legal Workflows" legal)
  (attr "matter.status" string)
  (attr client entityRef)
  (entity Matter ["matter.status" client] "A legal matter.")
  (form conflict_check "Conflict Check"
    (field cleared boolean "Conflict cleared" (required))
    (requires client))
  (flow matter_intake Matter "Matter intake" "Collects conflict evidence." collect_conflict
    (collect collect_conflict conflict_check client (next open))
    (assert open "matter.status" open (next done))
    (done))
  (action close_matter Matter "Close matter"
    (assert "matter.status" closed)))
`;

    const parsed = parseFormaAccountConfigSource(source);

    expect(parsed.config).not.toBeNull();
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.config).toMatchObject({
      account: {
        slug: "legal-workflows",
        name: "Legal Workflows",
        kind: "legal",
      },
      entityTypes: [
        {
          name: "Matter",
          attributes: ["matter.status", "client"],
          description: "A legal matter.",
        },
      ],
      requirements: [{ form: "conflict_check", scopeAttr: "client" }],
      flows: [
        {
          name: "matter_intake",
          subjectType: "Matter",
          startStepId: "collect_conflict",
        },
      ],
      actions: [
        {
          name: "close_matter",
          appliesTo: "Matter",
          asserts: { "matter.status": "closed" },
        },
      ],
    });
    expect(accountConfigToFormaSource(parsed.config)).not.toContain("(account-config");
  });

  it("parses grouped Forma section wrappers", () => {
    const source = `
(account-config
  (tenant legal-workflows "Legal Workflows" legal)
  (attributes
    (attr "matter.status" string)
    (attr client entityRef))
  (entities
    (entity Matter ["matter.status" client] "A legal matter."))
  (forms
    (form conflict_check "Conflict Check"
      (field cleared boolean "Conflict cleared" (required))
      (requires client)))
  (flows
    (flow matter_intake Matter "Matter intake" "Collects conflict evidence." collect_conflict
      (collect collect_conflict conflict_check client (next open))
      (assert open "matter.status" open (next done))
      (done)))
  (actions
    (action close_matter Matter "Close matter"
      (assert "matter.status" closed))))
`;

    const parsed = parseFormaAccountConfigSource(source);

    expect(parsed.config).not.toBeNull();
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.config).toMatchObject({
      attributes: [
        { name: "matter.status", valueType: "string" },
        { name: "client", valueType: "entityRef" },
      ],
      entityTypes: [
        {
          name: "Matter",
          attributes: ["matter.status", "client"],
        },
      ],
      forms: [{ form: "conflict_check" }],
      requirements: [{ form: "conflict_check", scopeAttr: "client" }],
      flows: [{ name: "matter_intake", subjectType: "Matter" }],
      actions: [{ name: "close_matter", appliesTo: "Matter" }],
    });
    const normalized = accountConfigToFormaSource(parsed.config);
    expect(normalized).not.toContain("(attributes");
    expect(normalized).toContain('(tenant "legal-workflows" "Legal Workflows" "legal")');
    expect(validateFormaAccountConfigSource(normalized)).toEqual([]);
  });

  it("parses grouped Forma resource children", () => {
    const source = `
(tenant legal-workflows "Legal Workflows" legal)
(attr "matter.status" string)
(attr client entityRef)
(entity Matter ["matter.status" client] "A legal matter.")
(form conflict_check "Conflict Check"
  (fields
    (field cleared boolean "Conflict cleared" (required)))
  (requirements
    (requires client "Client-scoped conflict check.")))
(flow matter_intake Matter "Matter intake" "Collects conflict evidence." collect_conflict
  (steps
    (collect collect_conflict conflict_check client (next done))
    (done)))
(action close_matter Matter "Close matter"
  (fields
    (field reason string "Reason"))
  (asserts
    (assert "matter.status" closed)))
`;

    const parsed = accountConfigFromFormaSource(source);
    const normalized = accountConfigToFormaSource(parsed);

    expect(validateAccountConfig(parsed)).toEqual([]);
    expect(parsed).toMatchObject({
      forms: [
        {
          form: "conflict_check",
          fields: [{ name: "cleared", label: "Conflict cleared", type: "boolean" }],
        },
      ],
      requirements: [
        {
          form: "conflict_check",
          scopeAttr: "client",
          description: "Client-scoped conflict check.",
        },
      ],
      flows: [
        {
          name: "matter_intake",
          steps: [
            {
              id: "collect_conflict",
              type: "collect",
              config: { form: "conflict_check", scopeFrom: "client" },
              next: "done",
            },
            { id: "done", type: "done" },
          ],
        },
      ],
      actions: [
        {
          name: "close_matter",
          fields: [{ name: "reason", label: "Reason", type: "string" }],
          asserts: { "matter.status": "closed" },
        },
      ],
    });
    expect(normalized).not.toContain("(fields");
    expect(normalized).not.toContain("(steps");
    expect(normalized).not.toContain("(asserts");
    expect(normalized).toContain('(field "cleared" "boolean" "Conflict cleared"');
    expect(normalized).toContain('(collect "collect_conflict" "conflict_check" "client" (next "done"))');
    expect(normalized).toContain('(assert "matter.status" "closed")');
  });

  it("parses grouped compact Forma entity children", () => {
    const source = `
(tenant legal-workflows "Legal Workflows" legal)
(entity Matter "A legal matter."
  (attributes
    (attr "matter.status" string)
    (attr client entityRef))
  (forms
    (form conflict_check "Conflict Check"
      (fields
        (field cleared boolean "Conflict cleared" (required)))))
  (requirements
    (requires conflict_check client "Client-scoped conflict check."))
  (flows
    (flow matter_intake "Matter intake" "Collects conflict evidence." collect_conflict
      (steps
        (collect collect_conflict conflict_check client (next done))
        (done))))
  (actions
    (action close_matter "Close matter"
      (asserts
        (assert "matter.status" closed)))))
`;

    const parsed = accountConfigFromFormaSource(source);
    const normalized = accountConfigToFormaSource(parsed);

    expect(validateAccountConfig(parsed)).toEqual([]);
    expect(parsed).toMatchObject({
      attributes: [
        { name: "matter.status", valueType: "string" },
        { name: "client", valueType: "entityRef" },
      ],
      entityTypes: [
        {
          name: "Matter",
          attributes: ["matter.status", "client"],
          description: "A legal matter.",
        },
      ],
      forms: [{ form: "conflict_check" }],
      requirements: [
        {
          form: "conflict_check",
          scopeAttr: "client",
          description: "Client-scoped conflict check.",
        },
      ],
      flows: [
        {
          name: "matter_intake",
          subjectType: "Matter",
        },
      ],
      actions: [
        {
          name: "close_matter",
          appliesTo: "Matter",
          asserts: { "matter.status": "closed" },
        },
      ],
    });
    expect(normalized).toContain('(entity "Matter" "A legal matter."');
    expect(normalized).toContain('(attr "matter.status" "string")');
    expect(normalized).not.toContain("(attributes");
    expect(normalized).not.toContain("(forms");
    expect(normalized).not.toContain("(actions");
  });

  it("maps account-config wrapped diagnostics to nested source locations", () => {
    const parsed = parseFormaAccountConfigSource(`
(account-config
  (tenant legal-workflows "Legal Workflows" legal)
  (widget unsupported))
`);

    expect(parsed.config).toBeNull();
    expect(parsed.diagnostics).toEqual([
      expect.objectContaining({
        message: "unknown account config form: widget",
        loc: expect.objectContaining({ line: 4, col: 3 }),
      }),
    ]);
  });

  it("rejects section wrapper children with the wrong resource type", () => {
    const parsed = parseFormaAccountConfigSource(`
(account-config
  (tenant legal-workflows "Legal Workflows" legal)
  (forms
    (flow misplaced Matter "Misplaced")))
`);

    expect(parsed.config).toBeNull();
    expect(parsed.diagnostics).toEqual([
      expect.objectContaining({
        message:
          "forms wrapper can only contain form resources; found flow. Move flow resources under the flows wrapper or keep them top-level.",
        loc: expect.objectContaining({ line: 5, col: 5 }),
      }),
    ]);
  });

  it("suggests close child heads inside grouped Forma wrappers", () => {
    const sectionParsed = parseFormaAccountConfigSource(`
(account-config
  (tenant legal-workflows "Legal Workflows" legal)
  (forms
    (fom intake "Intake")))
`);

    expect(sectionParsed.config).toBeNull();
    expect(sectionParsed.diagnostics).toEqual([
      expect.objectContaining({
        message: "forms wrapper can only contain form resources; found fom. Did you mean form?",
        loc: expect.objectContaining({ line: 5, col: 5 }),
      }),
    ]);

    const nestedParsed = parseFormaAccountConfigSource(`
(tenant legal-workflows "Legal Workflows" legal)
(form intake "Intake"
  (fields
    (fild ready boolean)))
`);

    expect(nestedParsed.config).toBeNull();
    expect(nestedParsed.diagnostics).toEqual([
      expect.objectContaining({
        message: "fields wrapper can only contain field resources; found fild. Did you mean field?",
        loc: expect.objectContaining({ line: 5, col: 5 }),
      }),
    ]);
  });

  it("rejects grouped resource children with the wrong form type", () => {
    const parsed = parseFormaAccountConfigSource(`
(tenant legal-workflows "Legal Workflows" legal)
(form intake "Intake"
  (fields
    (attr misplaced string)))
`);

    expect(parsed.config).toBeNull();
    expect(parsed.diagnostics).toEqual([
      expect.objectContaining({
        message:
          "fields wrapper can only contain field resources; found attr. Move attr resources under the attributes wrapper or keep them top-level.",
        loc: expect.objectContaining({ line: 5, col: 5 }),
      }),
    ]);
  });

  it("rejects non-form account-config wrapper entries with source locations", () => {
    const parsed = parseFormaAccountConfigSource(`
(account-config
  legal-workflows)
`);

    expect(parsed.config).toBeNull();
    expect(parsed.diagnostics).toEqual([
      expect.objectContaining({
        message: "account-config wrapper can only contain account config forms",
        loc: expect.objectContaining({ line: 3, col: 3 }),
      }),
    ]);
  });

  it("reports duplicate singleton Forma metadata with authored locations", () => {
    const source = `(tenant legal-workflows "Legal Workflows" legal)
(attr client entityRef)
(entity Matter [client])
(form intake "Intake"
  (title "First")
  (title "Second")
  (field ready boolean "Ready"
    (label "Ready?")
    (label "Ready again")))
(flow review Matter "Review" "Review flow" collect
  (start collect)
  (start done)
  (collect collect intake client
    (next done)
    (next other))
  (done))
(action close Matter "Close"
  (opens-form intake client)
  (opens-form intake client))
`;

    const parsed = parseFormaAccountConfigSource(source);

    expect(parsed.config).not.toBeNull();
    expect(parsed.diagnostics).toEqual([
      expect.objectContaining({
        message: "form intake has multiple title entries; only the first is used",
        loc: expect.objectContaining({ line: 6, col: 3 }),
      }),
      expect.objectContaining({
        message:
          "form intake field ready has multiple label entries; only the first is used",
        loc: expect.objectContaining({ line: 9, col: 5 }),
      }),
      expect.objectContaining({
        message: "flow review has multiple start entries; only the first is used",
        loc: expect.objectContaining({ line: 12, col: 3 }),
      }),
      expect.objectContaining({
        message:
          "flow review step collect has multiple next entries; only the first is used",
        loc: expect.objectContaining({ line: 15, col: 5 }),
      }),
      expect.objectContaining({
        message: "action close has multiple opens-form entries; only the first is used",
        loc: expect.objectContaining({ line: 19, col: 3 }),
      }),
    ]);
  });

  it("rejects duplicate singleton Forma metadata through helper validation", () => {
    const source = `(tenant legal-workflows "Legal Workflows" legal)
(form intake "Intake"
  (title "First")
  (title "Second"))
`;

    expect(validateFormaAccountConfigSource(source)).toEqual([
      "form intake has multiple title entries; only the first is used",
    ]);
    expect(() => accountConfigFromFormaSource(source)).toThrow(
      /form intake has multiple title entries/,
    );
  });

  it("parses positional Forma requirement and action shorthands", () => {
    const source = `
(tenant (slug "acme-staffing") (name "Acme Staffing") (kind staffing))
(entity Worker
  (attr "worker.status" string)
  (attr employer entityRef)
  (attr role string)
  (form i9
    (title "Form I-9")
    (field ssn string "SSN" (required)))
  (requirement i9 employer 1095 "Verify employment eligibility." (when role forklift))
  (action request_i9 "Request I-9" "Open the I-9 collection form." (opens-form i9 employer))
  (action terminate "Terminate worker" "Mark a worker as terminated." (assert "worker.status" terminated)))
(action reactivate Worker "Reactivate worker" "Restore a terminated worker." (assert "worker.status" active))
`;

    const parsed = accountConfigFromFormaSource(source);

    expect(validateAccountConfig(parsed)).toEqual([]);
    expect(parsed).toMatchObject({
      requirements: [
        {
          form: "i9",
          scopeAttr: "employer",
          validityDays: 1095,
          description: "Verify employment eligibility.",
          guard: ["role", "forklift"],
        },
      ],
    });
    const actionsByName = new Map(
      ((parsed.actions as Record<string, unknown>[]) ?? []).map((action) => [
        action.name,
        action,
      ]),
    );
    expect(actionsByName.get("request_i9")).toMatchObject({
      label: "Request I-9",
      description: "Open the I-9 collection form.",
      appliesTo: "Worker",
      opensForm: { form: "i9", scope: "employer" },
    });
    expect(actionsByName.get("terminate")).toMatchObject({
      label: "Terminate worker",
      description: "Mark a worker as terminated.",
      appliesTo: "Worker",
      asserts: { "worker.status": "terminated" },
    });
    expect(actionsByName.get("reactivate")).toMatchObject({
      label: "Reactivate worker",
      description: "Restore a terminated worker.",
      appliesTo: "Worker",
      asserts: { "worker.status": "active" },
    });
  });

  it("accepts requires as a top-level and entity-local requirement alias", () => {
    const source = `
(tenant acme-staffing "Acme Staffing" staffing)
(attr employer entityRef)
(attr role string)
(form i9 "Form I-9"
  (field ssn string "SSN" (required)))
(requires i9 (scope employer) 1095 "Verify employment eligibility." (guard role full_time))
(form forklift "Forklift Certification"
  (field certified boolean "Certified" (required)))
(requires forklift employer (valid-for 365) "Annual forklift certification.")
(entity Worker
  (attr "worker.status" string)
  (form handbook "Handbook"
    (field signed boolean "Signed" (required))
    (requires (scope employer) (valid-for 30) "Collect handbook evidence."))
  (form policy "Policy"
    (field signed boolean "Signed" (required)))
  (requires policy (scope employer) "Collect policy evidence."))
`;

    const parsed = accountConfigFromFormaSource(source);
    const normalized = accountConfigToFormaSource(parsed);

    expect(validateAccountConfig(parsed)).toEqual([]);
    expect(parsed).toMatchObject({
      requirements: [
        {
          form: "i9",
          scopeAttr: "employer",
          validityDays: 1095,
          description: "Verify employment eligibility.",
          guard: ["role", "full_time"],
        },
        {
          form: "forklift",
          scopeAttr: "employer",
          validityDays: 365,
          description: "Annual forklift certification.",
        },
        {
          form: "handbook",
          scopeAttr: "employer",
          validityDays: 30,
          description: "Collect handbook evidence.",
        },
        {
          form: "policy",
          scopeAttr: "employer",
          description: "Collect policy evidence.",
        },
      ],
    });
    expect(normalized).toContain(
      '(requires "employer" 1095 "Verify employment eligibility." (when "role" "full_time"))',
    );
    expect(normalized).toContain('(requires "employer" 365 "Annual forklift certification.")');
    expect(normalized).toContain('(requires "employer" 30 "Collect handbook evidence.")');
    expect(normalized).toContain('(requires "employer" "Collect policy evidence.")');
    expect(normalized).not.toContain('(requirement "i9"');
    expect(normalized).not.toContain('(requirement "handbook"');
    expect(normalized).not.toContain('(requirement "policy"');
  });

  it("parses requirement guard and when pair, vector, and map shorthands", () => {
    const source = `
(tenant acme-staffing "Acme Staffing" staffing)
(entity Worker
  (attr employer entityRef)
  (attr role string)
  (form i9 "Form I-9"
    (field ssn string "SSN" (required)))
  (form forklift "Forklift Certification"
    (field acknowledged boolean "I acknowledge" (required)))
  (form remote_work "Remote Work Agreement"
    (field signed boolean "Signed" (required)))
  (requirement i9 employer (guard role "full_time"))
  (requirement forklift employer (when ["role" "forklift"]))
  (requirement remote_work employer (guard {"attribute" "role" "value" "remote"})))
`;

    const parsed = accountConfigFromFormaSource(source);
    const normalized = accountConfigToFormaSource(parsed);

    expect(validateAccountConfig(parsed)).toEqual([]);
    expect(parsed).toMatchObject({
      requirements: [
        { form: "i9", scopeAttr: "employer", guard: ["role", "full_time"] },
        { form: "forklift", scopeAttr: "employer", guard: ["role", "forklift"] },
        { form: "remote_work", scopeAttr: "employer", guard: ["role", "remote"] },
      ],
    });
    expect(normalized).toContain('(requires "employer" (when "role" "full_time"))');
    expect(normalized).toContain(
      '(requires "employer" (when "role" "forklift"))',
    );
    expect(normalized).toContain(
      '(requires "employer" (when "role" "remote"))',
    );
  });

  it("parses assert pair, vector, and map shorthands in flows and actions", () => {
    const source = `
(tenant legal-workflows "Legal Workflows" legal)
(entity Matter "A legal matter."
  (attr "matter.status" string)
  (attr "matter.reviewed" boolean)
  (flow matter_intake "Matter intake" "Marks review progress." open
    (assert open ["matter.status" open] (next reviewed))
    (assert reviewed {"attribute" "matter.reviewed" "value" true} (next done))
    (done))
  (action close_matter "Close matter" "Records the matter close decision."
    (assert ["matter.status" closed])
    (assert {"attr" "matter.reviewed" "value" false})))
`;

    const parsed = accountConfigFromFormaSource(source);
    const normalized = accountConfigToFormaSource(parsed);

    expect(validateAccountConfig(parsed)).toEqual([]);
    expect(parsed).toMatchObject({
      flows: [
        {
          steps: [
            {
              id: "open",
              type: "assert",
              config: { a: "matter.status", v: "open" },
              next: "reviewed",
            },
            {
              id: "reviewed",
              type: "assert",
              config: { a: "matter.reviewed", v: true },
              next: "done",
            },
            { id: "done", type: "done" },
          ],
        },
      ],
      actions: [
        {
          name: "close_matter",
          asserts: {
            "matter.status": "closed",
            "matter.reviewed": false,
          },
        },
      ],
    });
    expect(normalized).toContain('(assert "open" "matter.status" "open" (next "reviewed"))');
    expect(normalized).toContain('(assert "reviewed" "matter.reviewed" true (next "done"))');
    expect(normalized).toContain('(assert "matter.status" "closed")');
    expect(normalized).toContain('(assert "matter.reviewed" false)');
  });

  it("parses form-local requires shorthands into requirement IR", () => {
    const source = `
(tenant acme-staffing "Acme Staffing" staffing)
(entity Worker "A staffed worker."
  (attr employer entityRef)
  (attr role string)
  (form i9 "Form I-9" "Employment eligibility verification."
    (field ssn string "SSN" (required) (pii))
    (requires employer 1095 "Verify employment eligibility." (when role forklift)))
  (form handbook "Employee Handbook"
    (field acknowledged boolean "Acknowledged" (required))
    (requires (scope-attr employer))))
`;

    const parsed = accountConfigFromFormaSource(source);
    const normalized = accountConfigToFormaSource(parsed);
    const artifact = accountDeployArtifact(parsed);
    const graph = accountConfigResourceGraph(parsed);

    expect(validateAccountConfig(parsed)).toEqual([]);
    expect(parsed).toMatchObject({
      requirements: [
        {
          form: "i9",
          scopeAttr: "employer",
          validityDays: 1095,
          description: "Verify employment eligibility.",
          guard: ["role", "forklift"],
        },
        {
          form: "handbook",
          scopeAttr: "employer",
        },
      ],
    });
    expect(normalized).toContain(
      '(requires "employer" 1095 "Verify employment eligibility." (when "role" "forklift"))',
    );
    expect(normalized).toContain('(requires "employer")');
    expect(artifact.resources.requirements).toMatchObject({
      i9: {
        scope_attr: "employer",
        validity_days: 1095,
        description: "Verify employment eligibility.",
      },
      handbook: {
        scope_attr: "employer",
      },
    });
    expect(graph).toEqual(
      expect.arrayContaining([
        {
          fromKind: "requirement",
          fromName: "i9",
          relation: "requires",
          toKind: "form",
          toName: "i9",
        },
        {
          fromKind: "requirement",
          fromName: "i9",
          relation: "scope",
          toKind: "attribute",
          toName: "employer",
        },
      ]),
    );
  });

  it("parses compact Forma entity-scoped forms, flows, requirements, and actions", () => {
    const source = `
(account (slug "legal-workflows") (name "Legal Workflows") (kind legal))
(entity Matter
  (attr "matter.status" (value-type string) (cardinality one))
  (attr client (value-type entityRef))
  (form conflict_check "Conflict Check" "Conflict screening questions."
    (field cleared (label "Conflict cleared") (type boolean) (required true))
    (field decision select "Decision" ["approve" "reject"] (default-value approve)))
  (flow matter_intake
    (title "Matter intake")
    (start conflict)
    (step conflict
      (collect conflict_check client)
      (next route))
    (step route
      (branch [["?s" "matter.status" "pending"]] open done))
    (step open
      (assert "matter.status" open)
      (next notify))
    (step notify
      (notify "Matter opened")
      (next done))
    (step done (done)))
  (requirement conflict_check (scope-attr client))
  (action close_matter
    (label "Close matter")
    (opens-form conflict_check (scope client))
    (assert "matter.status" closed)))
`;

    const parsed = accountConfigFromFormaSource(source);

    expect(validateAccountConfig(parsed)).toEqual([]);
    expect(parsed).toMatchObject({
      forms: [
        {
          form: "conflict_check",
          title: "Conflict Check",
          description: "Conflict screening questions.",
          fields: [
            {
              name: "cleared",
              label: "Conflict cleared",
              type: "boolean",
              required: true,
            },
            {
              name: "decision",
              label: "Decision",
              type: "select",
              options: ["approve", "reject"],
              defaultValue: "approve",
            },
          ],
        },
      ],
      flows: [
        {
          name: "matter_intake",
          title: "Matter intake",
          subjectType: "Matter",
          startStepId: "conflict",
          steps: [
            {
              id: "conflict",
              type: "collect",
              config: { form: "conflict_check", scopeFrom: "client" },
              next: "route",
            },
            {
              id: "route",
              type: "branch",
              config: {
                where: [["?s", "matter.status", "pending"]],
                ifTrue: "open",
                ifFalse: "done",
              },
            },
            {
              id: "open",
              type: "assert",
              config: { a: "matter.status", v: "open" },
              next: "notify",
            },
            {
              id: "notify",
              type: "notify",
              config: { message: "Matter opened" },
              next: "done",
            },
            { id: "done", type: "done" },
          ],
        },
      ],
      requirements: [{ form: "conflict_check", scopeAttr: "client" }],
      actions: [
        {
          name: "close_matter",
          label: "Close matter",
          appliesTo: "Matter",
          opensForm: { form: "conflict_check", scope: "client" },
          asserts: { "matter.status": "closed" },
        },
      ],
    });
  });

  it("parses compact Forma branch and action flow steps", () => {
    const parsed = accountConfigFromFormaSource(`
(tenant (slug "legal-workflows") (name "Legal Workflows") (kind legal))
(entity Matter
  (attr "matter.status" (value-type string) (cardinality one))
  (attr client entityRef)
  (form conflict_check
    (title "Conflict Check")
    (field cleared (label "Conflict cleared") (type boolean)))
  (flow matter_intake "Matter intake" "Open a new matter with required review." route
    (branch route [["?s" "matter.status" "pending"]] review done worker)
    (collect collect conflict_check (scope client) (reminder-seconds 60) (escalate-seconds 300) (expire-seconds 900) (next done))
    (action review "Conflict review" "matter.status" reviewed (delay-seconds 2) (next cooldown))
    (wait cooldown 3 (next notify))
    (notify notify "Review complete" email "$arg.responsible.attorney" "review-complete" (delay-seconds 5) (next done))
    (done)))
`);

    expect(validateAccountConfig(parsed)).toEqual([]);
    expect(parsed).toMatchObject({
      flows: [
        {
          name: "matter_intake",
          title: "Matter intake",
          description: "Open a new matter with required review.",
          subjectType: "Matter",
          startStepId: "route",
          steps: [
            {
              id: "route",
              type: "branch",
              config: {
                where: [["?s", "matter.status", "pending"]],
                ifTrue: "review",
                ifFalse: "done",
                subjectVar: "worker",
              },
            },
            {
              id: "collect",
              type: "collect",
              config: {
                form: "conflict_check",
                scopeFrom: "client",
                reminderSeconds: 60,
                escalateSeconds: 300,
                expireSeconds: 900,
              },
              next: "done",
            },
            {
              id: "review",
              type: "action",
              config: {
                label: "Conflict review",
                resultAttr: "matter.status",
                resultValue: "reviewed",
                delaySeconds: 2,
              },
              next: "cooldown",
            },
            {
              id: "cooldown",
              type: "wait",
              config: { seconds: 3 },
              next: "notify",
            },
            {
              id: "notify",
              type: "notify",
              config: {
                message: "Review complete",
                channel: "email",
                to: "$arg.responsible.attorney",
                template: "review-complete",
                delaySeconds: 5,
              },
              next: "done",
            },
            { id: "done", type: "done" },
          ],
        },
      ],
    });
    expect(accountConfigToFormaSource(parsed)).toContain("    (done)\n");
  });

  it("parses delay and pause as compact wait step aliases", () => {
    const parsed = accountConfigFromFormaSource(`
(tenant legal-workflows "Legal Workflows" legal)
(attr "matter.status" string)
(entity Matter ["matter.status"])
(flow matter_review Matter "Matter review" "Review timing aliases." cool_down
  (delay cool_down 30 (next pause_review))
  (pause pause_review 60 (next done))
  (done))
`);

    expect(validateAccountConfig(parsed)).toEqual([]);
    expect(parsed).toMatchObject({
      flows: [
        expect.objectContaining({
          name: "matter_review",
          startStepId: "cool_down",
          steps: [
            {
              id: "cool_down",
              type: "wait",
              config: { seconds: 30 },
              next: "pause_review",
            },
            {
              id: "pause_review",
              type: "wait",
              config: { seconds: 60 },
              next: "done",
            },
            { id: "done", type: "done" },
          ],
        }),
      ],
    });
    const normalized = accountConfigToFormaSource(parsed);
    expect(normalized).toContain("(wait \"cool_down\" 30 (next \"pause_review\"))");
    expect(normalized).toContain("(wait \"pause_review\" 60 (next \"done\"))");
    expect(normalized).not.toContain("(delay");
    expect(normalized).not.toContain("(pause");
  });

  it("maps Forma validation diagnostics to authored source locations", () => {
    const source = `
(account (slug "legal-workflows") (name "Legal Workflows") (kind legal))
(attr broken bogus)
(entity Matter
  (attr "matter.status" (value-type string) (cardinality one))
  (requirement conflict_check (scope-attr client))
  (action close_matter
    (assert "missing.status" closed)))
`;

    const parsed = parseFormaAccountConfigSource(source);

    expect(parsed.config).not.toBeNull();
    expect(parsed.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "attribute broken has invalid valueType",
          path: "attribute:broken",
          loc: expect.objectContaining({ line: 3, col: 1 }),
        }),
        expect.objectContaining({
          message: "requirement references unknown form conflict_check",
          path: "requirement:conflict_check",
          loc: expect.objectContaining({ line: 6, col: 3 }),
        }),
        expect.objectContaining({
          message: "action close_matter asserts unknown attribute missing.status",
          path: "action:close_matter",
          loc: expect.objectContaining({ line: 7, col: 3 }),
        }),
      ]),
    );
  });

  it("maps form-local requires diagnostics to the nested requires line", () => {
    const source = `(tenant acme-staffing "Acme Staffing" staffing)
(entity Worker
  (attr employer entityRef)
  (form i9 "Form I-9"
    (field ssn string "SSN")
    (requires missing_scope)))
`;

    const parsed = parseFormaAccountConfigSource(source);

    expect(parsed.config).not.toBeNull();
    expect(parsed.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "requirement i9 references unknown scopeAttr missing_scope",
          path: "requirement:i9",
          loc: expect.objectContaining({ line: 6, col: 5 }),
        }),
      ]),
    );
  });

  it("maps form field attribute type diagnostics to authored field lines", () => {
    const source = `(tenant legal-workflows "Legal Workflows" legal)
(attr "matter.status" string)
(attr approved boolean)
(attr "risk.score" number)
(attr "review.date" date)
(form conflict_check "Conflict Check"
  (field "matter.status" boolean "Matter status")
  (field approved string "Approved")
  (field "risk.score" select "Risk score" ["low" "high"])
  (field "review.date" string "Review date"))
`;

    const parsed = parseFormaAccountConfigSource(source);

    expect(parsed.config).not.toBeNull();
    expect(parsed.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message:
            "form conflict_check field matter.status type must match matter.status attribute valueType string",
          path: "formField:conflict_check:matter.status",
          loc: expect.objectContaining({ line: 7, col: 3 }),
        }),
        expect.objectContaining({
          message:
            "form conflict_check field approved type must match approved attribute valueType boolean",
          path: "formField:conflict_check:approved",
          loc: expect.objectContaining({ line: 8, col: 3 }),
        }),
        expect.objectContaining({
          message:
            "form conflict_check field risk.score type must match risk.score attribute valueType number",
          path: "formField:conflict_check:risk.score",
          loc: expect.objectContaining({ line: 9, col: 3 }),
        }),
        expect.objectContaining({
          message:
            "form conflict_check field review.date type must match review.date attribute valueType date",
          path: "formField:conflict_check:review.date",
          loc: expect.objectContaining({ line: 10, col: 3 }),
        }),
      ]),
    );
  });

  it("maps action field attribute type diagnostics to authored field lines", () => {
    const source = `(tenant legal-workflows "Legal Workflows" legal)
(attr "matter.status" string)
(attr client entityRef)
(attr approved boolean)
(attr "risk.score" number)
(attr "review.date" date)
(entity Matter ["matter.status" client approved "risk.score" "review.date"])
(action close Matter "Close"
  (fields
    (field "matter.status" boolean "Matter status")
    (field client number "Client")
    (field approved string "Approved")
    (field "risk.score" select "Risk score" ["low" "high"])
    (field "review.date" boolean "Review date")))
`;

    const parsed = parseFormaAccountConfigSource(source);

    expect(parsed.config).not.toBeNull();
    expect(parsed.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message:
            "action close field matter.status type must match matter.status attribute valueType string",
          path: "actionField:close:matter.status",
          loc: expect.objectContaining({ line: 10, col: 5 }),
        }),
        expect.objectContaining({
          message:
            "action close field client type must match client attribute valueType entityRef",
          path: "actionField:close:client",
          loc: expect.objectContaining({ line: 11, col: 5 }),
        }),
        expect.objectContaining({
          message:
            "action close field approved type must match approved attribute valueType boolean",
          path: "actionField:close:approved",
          loc: expect.objectContaining({ line: 12, col: 5 }),
        }),
        expect.objectContaining({
          message:
            "action close field risk.score type must match risk.score attribute valueType number",
          path: "actionField:close:risk.score",
          loc: expect.objectContaining({ line: 13, col: 5 }),
        }),
        expect.objectContaining({
          message:
            "action close field review.date type must match review.date attribute valueType date",
          path: "actionField:close:review.date",
          loc: expect.objectContaining({ line: 14, col: 5 }),
        }),
      ]),
    );
  });

  it("maps typed literal validation diagnostics to authored Forma blocks", () => {
    const source = `(tenant legal-workflows "Legal Workflows" legal)
(attr "matter.status" string)
(attr approved boolean)
(attr "risk.score" number)
(attr client entityRef)
(entity Matter ["matter.status" approved "risk.score" client])
(form conflict_check "Conflict Check"
  (field cleared boolean "Cleared")
  (requires client (when approved "true")))
(flow review Matter "Review" "Review a matter." route
  (branch route [["?s" "risk.score" "high"]] approve done)
  (assert approve approved "true" (next score))
  (action score "Score" "risk.score" "5" (next done))
  (done))
(action close Matter "Close"
  (assert "matter.status" false)
  (assert client 123))
`;

    const parsed = parseFormaAccountConfigSource(source);

    expect(parsed.config).not.toBeNull();
    expect(parsed.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "requirement conflict_check guard value for approved must be a boolean",
          path: "requirement:conflict_check",
          loc: expect.objectContaining({ line: 9, col: 3 }),
        }),
        expect.objectContaining({
          message: "flow review step route where clause 1 value for risk.score must be a number",
          path: "flowStep:review:route",
          loc: expect.objectContaining({ line: 11, col: 3 }),
        }),
        expect.objectContaining({
          message: "flow review step approve assert value for approved must be a boolean",
          path: "flowStep:review:approve",
          loc: expect.objectContaining({ line: 12, col: 3 }),
        }),
        expect.objectContaining({
          message: "flow review step score action value for risk.score must be a number",
          path: "flowStep:review:score",
          loc: expect.objectContaining({ line: 13, col: 3 }),
        }),
        expect.objectContaining({
          message: "action close assert value for matter.status must be a string",
          path: "action:close",
          loc: expect.objectContaining({ line: 15, col: 1 }),
        }),
        expect.objectContaining({
          message: "action close assert value for client must be a string",
          path: "action:close",
          loc: expect.objectContaining({ line: 15, col: 1 }),
        }),
      ]),
    );
  });

  it("maps nested Forma validation diagnostics to field and step locations", () => {
    const source = `(tenant legal-workflows "Legal Workflows" legal)
(attr "matter.status" string)
(form intake "Intake"
  (fields
    (field ready boolean)))
(flow review Matter "Review" "Review a matter." route
  (steps
    (branch route [["?s" "matter.staus" "pending"]] collect done)
    (step collect (collect missing_form) done)
    (step done (done))))
(action close Matter "Close"
  (fields
    (field reason string))
  (assert "matter.status" closed))
`;

    const parsed = parseFormaAccountConfigSource(source);

    expect(parsed.config).not.toBeNull();
    expect(parsed.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "form intake field ready missing label",
          path: "formField:intake:ready",
          loc: expect.objectContaining({ line: 5, col: 5 }),
        }),
        expect.objectContaining({
          message:
            "flow review step route where clause 1 references unknown attribute matter.staus. Did you mean matter.status?",
          path: "flowStep:review:route",
          loc: expect.objectContaining({ line: 8, col: 5 }),
        }),
        expect.objectContaining({
          message: "flow review step collect collects unknown form missing_form",
          path: "flowStep:review:collect",
          loc: expect.objectContaining({ line: 9, col: 5 }),
        }),
        expect.objectContaining({
          message: "action close field reason missing label",
          path: "actionField:close:reason",
          loc: expect.objectContaining({ line: 13, col: 5 }),
        }),
      ]),
    );
  });

  it("maps duplicate nested Forma diagnostics to field and step locations", () => {
    const source = `(tenant legal-workflows "Legal Workflows" legal)
(attr "matter.status" string)
(form intake "Intake"
  (field ready boolean "Ready")
  (field ready boolean "Ready again"))
(flow review Matter "Review" "Review a matter." collect
  (step collect (done))
  (step collect (done)))
(action close Matter "Close"
  (field reason string "Reason")
  (field reason string "Reason again")
  (assert "matter.status" closed))
`;

    const parsed = parseFormaAccountConfigSource(source);

    expect(parsed.config).not.toBeNull();
    expect(parsed.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message:
            "duplicate form intake field: ready (first defined on line 4, duplicate on line 5)",
          path: "formField:intake:ready",
          loc: expect.objectContaining({ line: 5, col: 3 }),
        }),
        expect.objectContaining({
          message:
            "duplicate flow review step: collect (first defined on line 7, duplicate on line 8)",
          path: "flowStep:review:collect",
          loc: expect.objectContaining({ line: 8, col: 3 }),
        }),
        expect.objectContaining({
          message:
            "duplicate action close field: reason (first defined on line 10, duplicate on line 11)",
          path: "actionField:close:reason",
          loc: expect.objectContaining({ line: 11, col: 3 }),
        }),
      ]),
    );
  });

  it("maps unknown Forma forms to exact source locations", () => {
    const parsed = parseFormaAccountConfigSource(`
(account (slug "legal-workflows"))
(widget unsupported)
`);

    expect(parsed.config).toBeNull();
    expect(parsed.diagnostics).toEqual([
      expect.objectContaining({
        message: "unknown account config form: widget",
        loc: expect.objectContaining({ line: 3, col: 1 }),
      }),
    ]);
  });

  it("suggests Forma resource names for ambiguous unknown heads", () => {
    const parsed = parseFormaAccountConfigSource(`
(account (slug "legal-workflows"))
(entityType Matter)
(startStepId conflict)
(field ready boolean)
`);

    expect(parsed.config).toBeNull();
    expect(parsed.diagnostics).toEqual([
      expect.objectContaining({
        message:
          "unknown account config form: entityType. Use entity-type for standalone entity types, entity for compact entities, or entities as a grouping wrapper.",
        loc: expect.objectContaining({ line: 3, col: 1 }),
      }),
      expect.objectContaining({
        message:
          "unknown account config form: startStepId. Use start inside a flow, or the compact positional flow start shorthand.",
        loc: expect.objectContaining({ line: 4, col: 1 }),
      }),
      expect.objectContaining({
        message:
          "unknown account config form: field. Field resources must be nested inside a form/action, or inside a fields wrapper within one.",
        loc: expect.objectContaining({ line: 5, col: 1 }),
      }),
    ]);
  });

  it("suggests Forma spellings for JSON-style deployment vocabulary", () => {
    const parsed = parseFormaAccountConfigSource(`
(accountConfig
  (tenant legal-workflows "Legal Workflows" legal)
  (entityTypes
    (entityType Matter))
  (opensForm conflict_check))
`);

    expect(parsed.config).toBeNull();
    expect(parsed.diagnostics).toEqual([
      expect.objectContaining({
        message:
          "unknown account config form: accountConfig. Use account-config as the bundle wrapper.",
        loc: expect.objectContaining({ line: 2, col: 1 }),
      }),
    ]);

    const sectionParsed = parseFormaAccountConfigSource(`
(account-config
  (tenant legal-workflows "Legal Workflows" legal)
  (entityTypes
    (entityType Matter))
  (opensForm conflict_check))
`);

    expect(sectionParsed.config).toBeNull();
    expect(sectionParsed.diagnostics).toEqual([
      expect.objectContaining({
        message:
          "unknown account config form: entityTypes. Use entity-type for standalone entity types, entity for compact entities, or entities as a grouping wrapper.",
        loc: expect.objectContaining({ line: 4, col: 3 }),
      }),
      expect.objectContaining({
        message:
          "unknown account config form: opensForm. Use opens-form inside an action.",
        loc: expect.objectContaining({ line: 6, col: 3 }),
      }),
    ]);
  });

  it("suggests close Forma head matches for ordinary typos", () => {
    const parsed = parseFormaAccountConfigSource(`
(acount (slug "legal-workflows"))
(entitty Matter)
(requiremnt conflict_check client)
`);

    expect(parsed.config).toBeNull();
    expect(parsed.diagnostics).toEqual([
      expect.objectContaining({
        message: "unknown account config form: acount. Did you mean account?",
        loc: expect.objectContaining({ line: 2, col: 1 }),
      }),
      expect.objectContaining({
        message: "unknown account config form: entitty. Did you mean entity?",
        loc: expect.objectContaining({ line: 3, col: 1 }),
      }),
      expect.objectContaining({
        message: "unknown account config form: requiremnt. Did you mean requirement?",
        loc: expect.objectContaining({ line: 4, col: 1 }),
      }),
    ]);
  });

  it("maps Forma lowering errors inside known forms to authored source locations", () => {
    const parsed = parseFormaAccountConfigSource(`
(tenant legal-workflows "Legal Workflows" legal)
(form conflict_check "Conflict Check"
  (field decision select "Decision" (options "approve")))
`);

    expect(parsed.config).toBeNull();
    expect(parsed.diagnostics).toEqual([
      expect.objectContaining({
        message: "field options must be a vector",
        loc: expect.objectContaining({ line: 4 }),
      }),
    ]);
  });

  it("emits Forma source that round-trips through validation", () => {
    const source = accountConfigToFormaSource(CONFIG);
    const roundTrip = accountConfigFromFormaSource(source);

    expect(validateFormaAccountConfigSource(source)).toEqual([]);
    expect(accountConfigManifest(roundTrip)).toEqual(accountConfigManifest(CONFIG));
    expect(source).toContain('(tenant "legal-workflows" "Legal Workflows" "legal")');
    expect(source).toContain('(entity "Matter" "A legal matter."');
    expect(source).toContain('(attr "matter.status" "string")');
    expect(source).toContain('(attr "client" "entityRef")');
    expect(source).toContain('(field "cleared" "boolean" "Conflict cleared")');
    expect(source).not.toContain("(value-type ");
    expect(source).not.toContain("(cardinality \"one\")");
    expect(source).not.toContain("(description ");
    expect(source).not.toContain("(title ");
    expect(source).toContain("(done)");
    expect(source).toMatch(/\(flow "matter_intake" "Matter intake"\n\s+\(start "done"\)/);
    expect(source).not.toContain('(subject-type "Matter")');
    expect(source).not.toContain('(action "close_matter" "Matter"');
    expect(roundTrip).toMatchObject({
      account: CONFIG.account,
      flows: CONFIG.flows,
      actions: CONFIG.actions,
    });
  });

  it("emits compact Forma step shorthands for common workflow steps", () => {
    const source = accountConfigToFormaSource({
      account: { slug: "legal-workflows", name: "Legal Workflows", kind: "legal" },
      attributes: [
        { name: "matter.status", valueType: "string", cardinality: "one" },
        { name: "client", valueType: "entityRef", cardinality: "one" },
      ],
      entityTypes: [{ name: "Matter", attributes: ["name", "matter.status"] }],
      forms: [
        {
          form: "conflict_check",
          title: "Conflict Check",
          description: "Conflict screening questions.",
          fields: [
            {
              name: "cleared",
              label: "Conflict cleared",
              type: "boolean",
              required: true,
              description: "Shown in intake",
            },
            {
              name: "decision",
              label: "Decision",
              type: "select",
              options: ["approve", "reject"],
              defaultValue: "approve",
            },
          ],
        },
      ],
      flows: [
        {
          name: "matter_intake",
          title: "Matter intake",
          description: "Open a new matter with required review.",
          subjectType: "Matter",
          startStepId: "conflict",
          steps: [
            {
              id: "conflict",
              type: "collect",
              config: {
                form: "conflict_check",
                scopeFrom: "client",
                reminderSeconds: 60,
                escalateSeconds: 300,
                expireSeconds: 900,
              },
              next: "route",
            },
            {
              id: "route",
              type: "branch",
              config: {
                where: [["?s", "matter.status", "pending"]],
                ifTrue: "open",
                ifFalse: "done",
                subjectVar: "matter",
              },
            },
            {
              id: "open",
              type: "assert",
              config: { a: "matter.status", v: "open" },
              next: "notify",
            },
            {
              id: "notify",
              type: "notify",
              config: {
                message: "Matter opened",
                channel: "email",
                to: "$arg.responsible.attorney",
                template: "matter-opened",
                delaySeconds: 5,
              },
              next: "cooldown",
            },
            {
              id: "cooldown",
              type: "wait",
              config: { seconds: 3 },
              next: "review",
            },
            {
              id: "review",
              type: "action",
              config: {
                label: "Conflict review",
                resultAttr: "matter.status",
                resultValue: "reviewed",
                delaySeconds: 2,
              },
              next: "done",
            },
            { id: "done", type: "done" },
          ],
        },
      ],
      requirements: [
        {
          form: "conflict_check",
          scopeAttr: "client",
          description: "Client-scoped conflict check.",
        },
      ],
      actions: [
        {
          name: "request_conflict_check",
          label: "Request conflict check",
          description: "Collect conflict review details.",
          appliesTo: "Matter",
          fields: [
            {
              name: "reason",
              label: "Reason",
              type: "select",
              options: ["conflict", "client"],
              required: false,
              defaultValue: "conflict",
              description: "Review rationale",
            },
          ],
          opensForm: { form: "conflict_check", scope: "client" },
        },
      ],
    });

    expect(source).toContain(
      '(requires "client" "Client-scoped conflict check.")',
    );
    expect(source).toContain('(action "request_conflict_check" "Request conflict check" "Collect conflict review details."');
    expect(source).toContain(
      '(field "reason" "select" "Reason" ["conflict" "client"] "Review rationale" (required false) (default "conflict"))',
    );
    expect(source).not.toContain('(action "request_conflict_check" "Matter"');
    expect(source).toContain('(opens-form "conflict_check" "client")');
    expect(source).toContain('(entity "Matter"');
    expect(source).toContain('(attr "matter.status" "string")');
    expect(source).toContain('(field "cleared" "boolean" "Conflict cleared" "Shown in intake" (required))');
    expect(source).toContain(
      '(field "decision" "select" "Decision" ["approve" "reject"] (default "approve"))',
    );
    expect(source).toMatch(/\(form "conflict_check" "Conflict Check" "Conflict screening questions."\n\s+\(field/);
    expect(source).toMatch(/\(flow "matter_intake" "Matter intake" "Open a new matter with required review." "conflict"\n\s+\(collect/);
    expect(source).not.toContain('(subject-type "Matter")');
    expect(source).toContain(
      '(collect "conflict" "conflict_check" "client" (reminder-seconds 60) (escalate-seconds 300) (expire-seconds 900) (next "route"))',
    );
    expect(source).toContain(
      '(branch "route" [["?s" "matter.status" "pending"]] "open" "done" "matter")',
    );
    expect(source).toContain('(assert "open" "matter.status" "open" (next "notify"))');
    expect(source).toContain(
      '(notify "notify" "Matter opened" "email" "$arg.responsible.attorney" "matter-opened" (delay-seconds 5) (next "cooldown"))',
    );
    expect(source).toContain('(wait "cooldown" 3 (next "review"))');
    expect(source).toContain(
      '(action "review" "Conflict review" "matter.status" "reviewed" (delay-seconds 2) (next "done"))',
    );
    expect(validateFormaAccountConfigSource(source)).toEqual([]);
    expect(accountConfigFromFormaSource(source).forms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          form: "conflict_check",
          fields: expect.arrayContaining([
            expect.objectContaining({
              name: "decision",
              defaultValue: "approve",
            }),
          ]),
        }),
      ]),
    );
    expect(accountConfigFromFormaSource(source).flows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          steps: expect.arrayContaining([
            expect.objectContaining({
              id: "notify",
              type: "notify",
              config: {
                message: "Matter opened",
                channel: "email",
                to: "$arg.responsible.attorney",
                template: "matter-opened",
                delaySeconds: 5,
              },
              next: "cooldown",
            }),
          ]),
        }),
      ]),
    );
  });
});
