// The bundled staffing blueprint.
//
// This is app/product declaration data: entity types, attributes, forms, flows,
// requirements, actions, and generated views. `convex/appconfig.ts` owns only
// the Convex mutation that lowers this declaration into the store.

const I9_FIELDS = [
  { name: "ssn", label: "SSN", type: "string", required: true, pii: true },
  {
    name: "citizenship",
    label: "Citizenship",
    type: "select",
    options: ["citizen", "permanent_resident", "authorized_alien"],
    required: true,
  },
];

const ACK_FIELD = [
  {
    name: "acknowledged",
    label: "I acknowledge",
    type: "boolean",
    required: true,
  },
];

const ONBOARDING_STEPS = [
  {
    id: "i9",
    type: "collect",
    config: { form: "i9", scopeFrom: "employer" },
    next: "branch",
  },
  {
    id: "branch",
    type: "branch",
    config: {
      where: [["?s", "i9/citizenship", "authorized_alien"]],
      ifTrue: "everify",
      ifFalse: "welcome",
    },
  },
  {
    id: "everify",
    type: "action",
    config: {
      label: "E-Verify check",
      resultAttr: "everify.status",
      resultValue: "verified",
    },
    next: "welcome",
  },
  {
    id: "welcome",
    type: "notify",
    config: { message: "Welcome aboard!" },
    next: "done",
  },
  { id: "done", type: "done" },
];

const expr = {
  lit: (value: unknown) => ({ kind: "literal", value }),
  state: (...path: string[]) => ({ kind: "var", source: "state", path }),
  query: (...path: string[]) => ({ kind: "var", source: "query", path }),
  row: (...path: string[]) => ({ kind: "var", source: "row", path }),
  neq: (left: unknown, right: unknown) => ({
    kind: "binary",
    op: "!==",
    left,
    right,
  }),
  eq: (left: unknown, right: unknown) => ({
    kind: "binary",
    op: "===",
    left,
    right,
  }),
  pipe: (name: string, value: unknown, args: unknown[] = []) => ({
    kind: "pipe",
    name,
    value,
    args,
  }),
};

const selectedWorker = expr.pipe("findBy", expr.query("workers"), [
  expr.lit("id"),
  expr.state("selectedWorkerId"),
]);
const selectedWorkerField = (field: string) =>
  expr.pipe("path", selectedWorker, [expr.lit(field)]);

export const STAFFING_VIEWS = [
  {
    name: "worker-roster",
    label: "Worker roster",
    description:
      "All workers with live status, local selection state, and ontology actions.",
    spec: {
      description:
        "All workers with live status, local selection state, and ontology actions.",
      state: {
        selectedWorkerId: { kind: "json", initial: null },
      },
      queries: {
        workers: {
          queryRef: "entities.queryEntities",
          params: { type: "Worker", pageSize: 50 },
        },
      },
      root: {
        type: "rows",
        children: [
          {
            type: "card",
            title: "Selected worker",
            description: "Actions are protected writes and the table updates live.",
            children: [
              {
                type: "condition",
                children: [
                  {
                    type: "case",
                    when: expr.neq(
                      expr.state("selectedWorkerId"),
                      expr.lit(null),
                    ),
                    children: [
                      {
                        type: "columns",
                        children: [
                          {
                            type: "rows",
                            children: [
                              {
                                type: "heading",
                                level: 3,
                                text: selectedWorkerField("name"),
                              },
                              {
                                type: "text",
                                content: selectedWorkerField("id"),
                              },
                            ],
                          },
                          {
                            type: "badge",
                            content: selectedWorkerField("worker.status"),
                          },
                        ],
                      },
                      {
                        type: "columns",
                        children: [
                          {
                            type: "button",
                            label: "Terminate",
                            variant: "destructive",
                            disabled: expr.eq(
                              expr.state("selectedWorkerId"),
                              expr.lit(null),
                            ),
                            events: {
                              onClick: {
                                action: "executeAction",
                                actionRef: "terminate",
                                entityId: expr.state("selectedWorkerId"),
                              },
                            },
                          },
                          {
                            type: "button",
                            label: "Reactivate",
                            variant: "outline",
                            disabled: expr.eq(
                              expr.state("selectedWorkerId"),
                              expr.lit(null),
                            ),
                            events: {
                              onClick: {
                                action: "executeAction",
                                actionRef: "reactivate",
                                entityId: expr.state("selectedWorkerId"),
                              },
                            },
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: "else",
                    children: [
                      {
                        type: "text",
                        content: "Select a worker row to enable actions.",
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: "table",
            bind: expr.query("workers"),
            emptyState: "No workers found.",
            columns: [
              { key: "name", label: "worker" },
              { key: "worker.status", label: "status", kind: "status" },
              { key: "id", label: "id", kind: "mono" },
            ],
            events: {
              onRowClick: {
                action: "setState",
                key: "selectedWorkerId",
                value: expr.row("id"),
              },
            },
          },
        ],
      },
    },
  },
  {
    name: "onboarding-dashboard",
    label: "Onboarding dashboard",
    description:
      "Overview metrics plus Maria's open compliance work from independent live bindings.",
    spec: {
      description:
        "Overview metrics plus Maria's open compliance work from independent live bindings.",
      queries: {
        summary: { queryRef: "overview.summary", params: {} },
        compliance: {
          queryRef: "compliance.workerCompliance",
          params: { worker: "worker:maria" },
        },
      },
      root: {
        type: "rows",
        children: [
          {
            type: "stat-group",
            children: [
              {
                type: "metric",
                label: "configured types",
                bind: expr.query("summary", "0", "configuredTypes"),
              },
              {
                type: "metric",
                label: "placements",
                bind: expr.query("summary", "0", "placements"),
              },
              {
                type: "metric",
                label: "open tasks",
                bind: expr.query("summary", "0", "open"),
              },
              {
                type: "metric",
                label: "satisfied",
                bind: expr.pipe("percent", expr.query("summary", "0", "satisfiedRatio"), []),
              },
            ],
          },
          {
            type: "card",
            title: "Open compliance",
            description: "Bound to compliance.workerCompliance for worker:maria.",
            children: [
              {
                type: "table",
                bind: expr.query("compliance"),
                emptyState: "No open compliance work.",
                columns: [
                  { key: "form", label: "form" },
                  { key: "scope", label: "scope", kind: "mono" },
                  { key: "because", label: "source facts" },
                ],
              },
            ],
          },
        ],
      },
    },
  },
];

export const STAFFING_BLUEPRINT = {
  attributes: [
    {
      name: "worker.status",
      valueType: "string",
      cardinality: "one",
      description: "Worker employment status.",
    },
    {
      name: "role",
      valueType: "string",
      cardinality: "one",
      description: "Job role.",
    },
    {
      name: "worker",
      valueType: "entityRef",
      cardinality: "one",
      description: "The worker on a placement.",
    },
    {
      name: "employer",
      valueType: "entityRef",
      cardinality: "one",
      description: "The employer on a placement.",
    },
    {
      name: "client",
      valueType: "entityRef",
      cardinality: "one",
      description: "The client on a placement.",
    },
    {
      name: "job",
      valueType: "entityRef",
      cardinality: "one",
      description: "The job on a placement.",
    },
    {
      name: "venue",
      valueType: "entityRef",
      cardinality: "one",
      description: "The venue on a placement.",
    },
  ],
  entityTypes: [
    {
      name: "Worker",
      attributes: ["name", "worker.status"],
      description: "A staffed worker.",
    },
    {
      name: "Employer",
      attributes: ["name"],
      description: "A staffing agency / employer of record.",
    },
    {
      name: "Client",
      attributes: ["name"],
      description: "A client site a worker is placed at.",
    },
    { name: "Job", attributes: ["name", "role"], description: "A job role." },
    { name: "Venue", attributes: ["name"], description: "A physical venue." },
    {
      name: "Placement",
      attributes: ["worker", "employer", "client", "job", "venue"],
      description: "A worker placed by an employer at a client/job/venue.",
    },
  ],
  forms: [
    { form: "i9", title: "Form I-9", fields: I9_FIELDS },
    {
      form: "handbook",
      title: "Employee Handbook Acknowledgement",
      fields: ACK_FIELD,
    },
    { form: "forklift", title: "Forklift Certification", fields: ACK_FIELD },
    { form: "venue_disclosure", title: "Venue Disclosure", fields: ACK_FIELD },
  ],
  flows: [
    {
      name: "onboarding",
      title: "Worker onboarding",
      subjectType: "Worker",
      startStepId: "i9",
      steps: ONBOARDING_STEPS,
    },
  ],
  requirements: [
    { form: "i9", scopeAttr: "employer", validityDays: 365 * 3 },
    { form: "handbook", scopeAttr: "client" },
    { form: "forklift", scopeAttr: "job", guard: ["role", "forklift"] },
    { form: "venue_disclosure", scopeAttr: "venue" },
  ],
  actions: [
    {
      name: "terminate",
      label: "Terminate worker",
      appliesTo: "Worker",
      asserts: { "worker.status": "terminated" },
    },
    {
      name: "reactivate",
      label: "Reactivate worker",
      appliesTo: "Worker",
      asserts: { "worker.status": "active" },
    },
  ],
  views: STAFFING_VIEWS,
};
