import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COMPACT_FORMA_SNIPPETS,
  accountMetadata,
  accountConfigResourceGraph,
  accountConfigResourceGraphMermaid,
  accountConfigSourceLineDiff,
  accountConfigSourceTextDigest,
  accountConfigSourceNavigationItems,
  accountConfigSourceOutline,
  compactFormaStarter,
  formaCompletionSuggestions,
  formatAccountConfigSource,
  parseAccountConfigSource,
} from "./configSource";

function expectUniqueCompletionLabels(
  suggestions: ReturnType<typeof formaCompletionSuggestions>,
) {
  const labels = suggestions.map((suggestion) => suggestion.label);
  const duplicateLabels = labels.filter(
    (label, index) => labels.indexOf(label) !== index,
  );
  expect(duplicateLabels).toEqual([]);
}

describe("account config source parsing", () => {
  it("parses JSON account config source", () => {
    const parsed = parseAccountConfigSource(
      JSON.stringify({
        account: { slug: "acme-staffing", name: "Acme Staffing" },
        attributes: [],
      }),
    );

    expect(parsed.error).toBeNull();
    expect(parsed.format).toBe("json");
    expect(parsed.config).toMatchObject({
      account: { slug: "acme-staffing" },
      attributes: [],
    });
  });

  it("parses YAML account config source", () => {
    const parsed = parseAccountConfigSource(`
account:
  slug: legal-workflows
  name: Legal Workflows
attributes:
  - name: matter.status
    valueType: string
    cardinality: one
`);

    expect(parsed.error).toBeNull();
    expect(parsed.format).toBe("yaml");
    expect(parsed.config).toMatchObject({
      account: { slug: "legal-workflows" },
      attributes: [{ name: "matter.status" }],
    });
  });

  it("parses Forma account config source", () => {
    const parsed = parseAccountConfigSource(`
(account (slug "legal-workflows") (name "Legal Workflows") (kind legal))
(attribute "matter.status" (value-type string) (cardinality one))
`);

    expect(parsed.error).toBeNull();
    expect(parsed.format).toBe("forma");
    expect(parsed.config).toMatchObject({
      account: { slug: "legal-workflows" },
      attributes: [{ name: "matter.status" }],
    });
  });

  it("parses compact Forma entity source", () => {
    const parsed = parseAccountConfigSource(`
(account (slug "legal-workflows") (name "Legal Workflows") (kind legal))
(entity Matter
  (description "A legal matter.")
  (attr "matter.status" (value-type string) (cardinality one))
  (attr client (value-type entityRef))
  (attr name)
  (form conflict_check
    (title "Conflict Check")
    (field cleared (label "Conflict cleared") (type boolean)))
  (flow matter_intake
    (start conflict)
    (step conflict
      (collect conflict_check (scope-from client))
      (next done))
    (step done (done)))
  (action close_matter
    (assert "matter.status" closed)))
`);

    expect(parsed.error).toBeNull();
    expect(parsed.format).toBe("forma");
    expect(parsed.config).toMatchObject({
      attributes: [
        { name: "matter.status", valueType: "string" },
        { name: "client", valueType: "entityRef", cardinality: "one" },
      ],
      entityTypes: [
        {
          name: "Matter",
          attributes: ["matter.status", "client", "name"],
        },
      ],
      flows: [
        {
          name: "matter_intake",
          subjectType: "Matter",
          startStepId: "conflict",
          steps: [
            {
              id: "conflict",
              type: "collect",
              config: { form: "conflict_check", scopeFrom: "client" },
              next: "done",
            },
            { id: "done", type: "done" },
          ],
        },
      ],
      actions: [{ name: "close_matter", appliesTo: "Matter" }],
    });
  });

  it("formats account config source as Forma", () => {
    const source = formatAccountConfigSource(
      {
        account: { slug: "legal-workflows", name: "Legal Workflows", kind: "legal" },
        attributes: [
          { name: "matter.status", valueType: "string", cardinality: "one" },
        ],
      },
      "forma",
    );
    const parsed = parseAccountConfigSource(source);

    expect(source).toContain("(tenant");
    expect(source).toContain("(attr");
    expect(parsed.format).toBe("forma");
    expect(parsed.config).toMatchObject({
      account: { slug: "legal-workflows" },
      attributes: [{ name: "matter.status" }],
    });
  });

  it("generates compact Forma starter source for the selected tenant", () => {
    const source = compactFormaStarter({
      slug: "acme-staffing",
      name: "Acme Staffing",
      kind: "staffing",
    });
    const parsed = parseAccountConfigSource(source);

    expect(source).toContain("(tenant ");
    expect(source).toContain("(entity Matter");
    expect(source).toContain("(attributes");
    expect(source).toContain("(fields");
    expect(source).toContain("(requirements");
    expect(source).toContain("(steps");
    expect(source).toContain("(asserts");
    expect(source).toContain("(attr \"matter.status\"");
    expect(source).toContain(
      '(form conflict_check "Conflict Check" "Collects conflict clearance evidence for the matter."',
    );
    expect(source).toContain(
      '(flow matter_intake "Matter intake" "Moves a matter from conflict clearance to open status." conflict',
    );
    expect(source).toContain(
      '(collect conflict conflict_check client (next open))',
    );
    expect(source).toContain(
      '(assert open "matter.status" open (next done))',
    );
    expect(source).toContain(
      '(requires client "Requires a client-scoped conflict check.")',
    );
    expect(source).toContain(
      '(action close_matter "Close matter" "Records the matter close decision."',
    );
    expect(source).toContain("(next ");
    expect(source).not.toContain("(requirement conflict_check client");
    expect(source).toContain("(opens-form conflict_check client)");
    expect(parsed.error).toBeNull();
    expect(parsed.format).toBe("forma");
    expect(parsed.config).toMatchObject({
      account: {
        slug: "acme-staffing",
        name: "Acme Staffing",
        kind: "staffing",
      },
      attributes: [
        { name: "matter.status", valueType: "string" },
        { name: "client", valueType: "entityRef" },
      ],
      entityTypes: [{ name: "Matter" }],
      forms: [{ form: "conflict_check" }],
      flows: [
        {
          name: "matter_intake",
          subjectType: "Matter",
          startStepId: "conflict",
        },
      ],
      requirements: [
        {
          form: "conflict_check",
          scopeAttr: "client",
          description: "Requires a client-scoped conflict check.",
        },
      ],
      actions: [
        {
          name: "close_matter",
          appliesTo: "Matter",
          description: "Records the matter close decision.",
          opensForm: { form: "conflict_check", scope: "client" },
        },
      ],
    });
  });

  it("ships valid compact Forma snippets for authoring", () => {
    for (const snippet of COMPACT_FORMA_SNIPPETS) {
      const parsed = parseAccountConfigSource(`
(account (slug "snippet-test") (name "Snippet Test") (kind custom))
${snippet.source}
`);

      expect(parsed.error, snippet.label).toBeNull();
      expect(parsed.format, snippet.label).toBe("forma");
      expect(parsed.config, snippet.label).toEqual(expect.any(Object));
    }
  });

  it("ships described compact Forma workflow snippets", () => {
    const snippet = COMPACT_FORMA_SNIPPETS.find((entry) => entry.label === "Entity workflow");

    expect(snippet?.source).toContain(
      '(form case_intake "Case Intake" "Collects the intake facts needed to open the case."',
    );
    expect(snippet?.source).toContain(
      '(flow case_review "Case review" "Routes a case from intake collection to completion." intake',
    );
    expect(snippet?.source).toContain(
      "(collect intake case_intake owner (next done))",
    );
    expect(snippet?.source).toContain(
      '(requires owner "Requires intake evidence for each owner scope.")',
    );
    expect(snippet?.source).toContain(
      '(action close_case "Close case" "Marks the configured case as closed."',
    );
    expect(snippet?.source).toContain("(next ");
  });

  it("ships a grouped Forma bundle snippet", () => {
    const snippet = COMPACT_FORMA_SNIPPETS.find((entry) => entry.label === "Grouped bundle");

    expect(snippet?.source).toContain("(account-config");
    expect(snippet?.source).toContain("(attributes");
    expect(snippet?.source).toContain("(entities");
    expect(snippet?.source).toContain("(requirements");
    expect(snippet?.source).toContain("(fields");
    expect(snippet?.source).toContain("(steps");
    expect(snippet?.source).toContain("(asserts");
  });

  it("ships a grouped compact entity snippet", () => {
    const snippet = COMPACT_FORMA_SNIPPETS.find((entry) => entry.label === "Grouped entity");

    expect(snippet?.source).toContain("(entity Case");
    expect(snippet?.source).toContain("(attributes");
    expect(snippet?.source).toContain("(forms");
    expect(snippet?.source).toContain("(actions");
  });

  it("ships parseable checked-in Forma tenant examples", () => {
    for (const path of [
      "configs/accounts/staffing.forma",
      "configs/accounts/legal-workflows.forma",
    ]) {
      const source = readFileSync(path, "utf8");
      const parsed = parseAccountConfigSource(source);

      expect(parsed.error, path).toBeNull();
      expect(parsed.format, path).toBe("forma");
      expect(parsed.diagnostics, path).toEqual([]);
      expect(parsed.config, path).toMatchObject({
        account: expect.objectContaining({ slug: expect.any(String) }),
        flows: expect.arrayContaining([
          expect.objectContaining({
            steps: expect.arrayContaining([
              expect.objectContaining({ type: expect.any(String) }),
            ]),
          }),
        ]),
      });
    }
  });

  it("computes deterministic source text digests", () => {
    const source = readFileSync("configs/accounts/legal-workflows.forma", "utf8");

    expect(accountConfigSourceTextDigest(source)).toMatch(/^cyrb53:/);
    expect(accountConfigSourceTextDigest(source)).toBe(
      accountConfigSourceTextDigest(source),
    );
    expect(accountConfigSourceTextDigest(`${source}\n`)).not.toBe(
      accountConfigSourceTextDigest(source),
    );
  });

  it("preserves account graph semantics across JSON YAML and Forma formatting", () => {
    const source = readFileSync("configs/accounts/legal-workflows.forma", "utf8");
    const parsed = parseAccountConfigSource(source);

    expect(parsed.config).not.toBeNull();
    const baselineGraph = accountConfigResourceGraph(parsed.config);
    const baselineAccount = accountMetadata(parsed.config);

    for (const format of ["json", "yaml", "forma"] as const) {
      const formatted = formatAccountConfigSource(parsed.config, format);
      const roundTrip = parseAccountConfigSource(formatted);

      expect(roundTrip.error, format).toBeNull();
      expect(roundTrip.format, format).toBe(format);
      expect(roundTrip.diagnostics, format).toEqual([]);
      expect(accountMetadata(roundTrip.config), format).toEqual(baselineAccount);
      expect(accountConfigResourceGraph(roundTrip.config), format).toEqual(baselineGraph);
    }
  });

  it("preserves form field defaults through normalized Forma formatting", () => {
    const parsed = parseAccountConfigSource(`
(tenant default-demo "Default Demo" custom)
(attr "case.status" string)
(entity Case ["case.status"])
(form status_update "Status Update"
  (field "case.status" select "Case Status" ["draft" "active" "closed"] (default-value active)))
`);
    expect(parsed.error).toBeNull();
    expect(parsed.diagnostics).toEqual([]);

    const formatted = formatAccountConfigSource(parsed.config, "forma");
    expect(formatted).toContain(
      '(field "case.status" "select" "Case Status" ["draft" "active" "closed"] (default "active"))',
    );

    const roundTrip = parseAccountConfigSource(formatted);
    expect(roundTrip.error).toBeNull();
    expect(roundTrip.diagnostics).toEqual([]);
    expect(roundTrip.config).toMatchObject({
      forms: [
        {
          form: "status_update",
          fields: [
            {
              name: "case.status",
              defaultValue: "active",
            },
          ],
        },
      ],
    });
  });

  it("builds normalized source line diffs for review", () => {
    const diff = accountConfigSourceLineDiff(
      "(tenant legal-workflows)\n(entity Matter)\n",
      "(tenant legal-workflows \"Legal Workflows\" legal)\n(entity Matter)\n",
    );

    expect(diff.changed).toBe(true);
    expect(diff.added).toBe(1);
    expect(diff.removed).toBe(1);
    expect(diff.lines).toEqual([
      {
        kind: "added",
        text: '(tenant legal-workflows "Legal Workflows" legal)',
        newLine: 1,
      },
      {
        kind: "removed",
        text: "(tenant legal-workflows)",
        oldLine: 1,
      },
      {
        kind: "same",
        text: "(entity Matter)",
        oldLine: 2,
        newLine: 2,
      },
    ]);
  });

  it("builds a resource outline from parsed source", () => {
    const parsed = parseAccountConfigSource(
      readFileSync("configs/accounts/legal-workflows.forma", "utf8"),
    );

    expect(parsed.config).not.toBeNull();
    const outline = accountConfigSourceOutline(parsed.config, readFileSync("configs/accounts/legal-workflows.forma", "utf8"));

    expect(outline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "entityType",
          label: "Types",
          items: expect.arrayContaining([
            expect.objectContaining({
              name: "Matter",
              detail: "5 attributes / A legal matter.",
              line: expect.any(Number),
            }),
          ]),
        }),
        expect.objectContaining({
          kind: "flow",
          label: "Flows",
          items: expect.arrayContaining([
            expect.objectContaining({
              name: "matter_intake",
              detail: "Matter / 4 steps",
              line: expect.any(Number),
            }),
          ]),
        }),
        expect.objectContaining({
          kind: "action",
          label: "Actions",
          items: [
            expect.objectContaining({
              name: "close_matter",
              detail: "on Matter",
              line: expect.any(Number),
            }),
          ],
        }),
      ]),
    );
  });

  it("includes authored resource descriptions in outline details", () => {
    const source = `
(tenant legal-workflows "Legal Workflows" legal)
(entity Matter "A legal matter."
  (attr "matter.status" string "Current lifecycle state.")
  (attr client entityRef)
  (form conflict_check "Conflict Check"
    (description "Collects conflict clearance evidence.")
    (field cleared boolean "Conflict cleared"))
  (flow matter_intake "Matter intake"
    (description "Guides matter intake.")
    (start done)
    (step done (done)))
  (requirement conflict_check client
    (description "Conflict checks are required."))
  (action close_matter "Close matter"
    (description "Records the close decision.")
    (assert "matter.status" closed)))
`;
    const parsed = parseAccountConfigSource(source);

    expect(parsed.error).toBeNull();
    const outline = accountConfigSourceOutline(parsed.config, source);

    expect(outline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "attribute",
          items: expect.arrayContaining([
            expect.objectContaining({
              name: "matter.status",
              detail: "string / one / Current lifecycle state.",
            }),
          ]),
        }),
        expect.objectContaining({
          kind: "form",
          items: expect.arrayContaining([
            expect.objectContaining({
              name: "conflict_check",
              detail: "1 field / Collects conflict clearance evidence.",
            }),
          ]),
        }),
        expect.objectContaining({
          kind: "flow",
          items: expect.arrayContaining([
            expect.objectContaining({
              name: "matter_intake",
              detail: "Matter / 1 step / Guides matter intake.",
            }),
          ]),
        }),
        expect.objectContaining({
          kind: "requirement",
          items: expect.arrayContaining([
            expect.objectContaining({
              name: "conflict_check",
              detail: "scope client / Conflict checks are required.",
            }),
          ]),
        }),
        expect.objectContaining({
          kind: "action",
          items: expect.arrayContaining([
            expect.objectContaining({
              name: "close_matter",
              detail: "on Matter / Records the close decision.",
            }),
          ]),
        }),
      ]),
    );
  });

  it("maps requirement outline lines to authored requires blocks", () => {
    const source = `
(tenant legal-workflows "Legal Workflows" legal)
(attr client entityRef)
(form conflict_check "Conflict Check"
  (field cleared boolean "Conflict cleared")
  (requires client "Conflict checks are required."))
(form engagement_letter "Engagement Letter"
  (field signed boolean "Signed"))
(requires engagement_letter client)
`;
    const parsed = parseAccountConfigSource(source);

    expect(parsed.error).toBeNull();
    const outline = accountConfigSourceOutline(parsed.config, source);
    const requirements = outline.find((group) => group.kind === "requirement")?.items ?? [];
    const conflict = requirements.find((item) => item.name === "conflict_check");
    const engagement = requirements.find((item) => item.name === "engagement_letter");

    expect(conflict?.line).toBe(6);
    expect(source.split("\n")[conflict!.line! - 1]).toContain("(requires client");
    expect(engagement?.line).toBe(9);
    expect(source.split("\n")[engagement!.line! - 1]).toContain("(requires engagement_letter");
  });

  it("builds account navigation and scoped requirement lines for grouped source review", () => {
    const source = `(tenant legal-workflows "Legal Workflows" legal)
(attr client entityRef)
(attr employer entityRef)
(form conflict_check "Conflict Check"
  (field cleared boolean "Conflict cleared")
  (requirements
    (requires (scope employer) "Employer-scoped conflict check.")))
(requires conflict_check client "Client-scoped top-level check.")
`;
    const parsed = parseAccountConfigSource(source);

    expect(parsed.error).toBeNull();
    expect(parsed.config).not.toBeNull();
    const outline = accountConfigSourceOutline(parsed.config, source);
    const account = outline.find((group) => group.kind === "account")?.items[0];
    const requirements = outline.find((group) => group.kind === "requirement")?.items ?? [];
    const employerRequirement = requirements.find((item) => item.detail?.includes("scope employer"));
    const clientRequirement = requirements.find((item) => item.detail?.includes("scope client"));
    const navigationItems = accountConfigSourceNavigationItems(outline);

    expect(account).toMatchObject({
      name: "legal-workflows",
      detail: "Legal Workflows / legal",
      line: 1,
    });
    expect(navigationItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Account: legal-workflows",
          line: 1,
        }),
      ]),
    );
    expect(employerRequirement?.line).toBe(7);
    expect(source.split("\n")[employerRequirement!.line! - 1]).toContain("(requires (scope employer)");
    expect(clientRequirement?.line).toBe(8);
    expect(source.split("\n")[clientRequirement!.line! - 1]).toContain("(requires conflict_check client");
  });

  it("builds distinct resource graphs for checked-in tenant configs", () => {
    const legalSource = readFileSync("configs/accounts/legal-workflows.forma", "utf8");
    const staffingSource = readFileSync("configs/accounts/staffing.forma", "utf8");
    const legal = parseAccountConfigSource(legalSource);
    const staffing = parseAccountConfigSource(staffingSource);

    expect(legal.config).not.toBeNull();
    expect(staffing.config).not.toBeNull();
    const legalGraph = accountConfigResourceGraph(legal.config);
    const staffingGraph = accountConfigResourceGraph(staffing.config);

    expect(legalGraph).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromKind: "entityType",
          fromName: "Matter",
          relation: "flow",
          toKind: "flow",
          toName: "matter_intake",
        }),
        expect.objectContaining({
          fromKind: "flow",
          fromName: "matter_intake",
          relation: "collect",
          toKind: "form",
          toName: "conflict_check",
        }),
        expect.objectContaining({
          fromKind: "action",
          fromName: "close_matter",
          relation: "asserts",
          toKind: "attribute",
          toName: "matter.status",
        }),
      ]),
    );
    expect(staffingGraph).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromKind: "entityType",
          fromName: "Worker",
          relation: "flow",
          toKind: "flow",
          toName: "onboarding",
        }),
        expect.objectContaining({
          fromKind: "flow",
          fromName: "onboarding",
          relation: "collect",
          toKind: "form",
          toName: "i9",
        }),
        expect.objectContaining({
          fromKind: "action",
          fromName: "terminate",
          relation: "asserts",
          toKind: "attribute",
          toName: "worker.status",
        }),
      ]),
    );
    expect(legalGraph).not.toEqual(staffingGraph);
  });

  it("builds jump navigation items from source outline line metadata", () => {
    const source = readFileSync("configs/accounts/legal-workflows.forma", "utf8");
    const parsed = parseAccountConfigSource(source);

    expect(parsed.config).not.toBeNull();
    const items = accountConfigSourceNavigationItems(
      accountConfigSourceOutline(parsed.config, source),
      source,
    );

    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Types: Matter",
          line: expect.any(Number),
        }),
        expect.objectContaining({
          label: "Flows: matter_intake",
          line: expect.any(Number),
        }),
        expect.objectContaining({
          label: "Actions: close_matter",
          line: expect.any(Number),
        }),
        expect.objectContaining({
          label: "Requirements: conflict_check",
          line: expect.any(Number),
        }),
      ]),
    );
    expect(items.every((item) => item.key.includes(":"))).toBe(true);
    const requirement = items.find((item) => item.label === "Requirements: conflict_check");
    expect(requirement).toBeDefined();
    expect(requirement?.detail).toContain("scope");
    expect(requirement?.sourceLine).toContain("(requires ");
    expect(source.split("\n")[requirement!.line - 1]).toContain("(requires ");
  });

  it("builds source-aware Forma completion suggestions from parsed config", () => {
    const parsed = parseAccountConfigSource(
      readFileSync("configs/accounts/legal-workflows.forma", "utf8"),
    );

    expect(parsed.config).not.toBeNull();
    const suggestions = formaCompletionSuggestions(parsed.config);
    expectUniqueCompletionLabels(suggestions);
    const staffingParsed = parseAccountConfigSource(
      readFileSync("configs/accounts/staffing.forma", "utf8"),
    );
    expect(staffingParsed.config).not.toBeNull();
    expectUniqueCompletionLabels(formaCompletionSuggestions(staffingParsed.config));
    const generic = (label: string) => suggestions.find((entry) => entry.label === label);

    expect(generic("New grouped bundle")).toEqual(
      expect.objectContaining({
        detail: "Account bundle with plural grouping wrappers for larger tenant files.",
        sourceAware: false,
        source: expect.stringContaining("(account-config"),
      }),
    );
    expect(generic("New entity")?.source).toContain("(entity Case");
    expect(generic("New grouped entity")).toEqual(
      expect.objectContaining({
        detail: "Compact entity organized with grouped child wrappers.",
        sourceAware: false,
        source: expect.stringContaining("(entity Case"),
      }),
    );
    expect(generic("New grouped bundle")?.source).toContain("(attributes");
    expect(generic("New grouped bundle")?.source).toContain("(entities");
    expect(generic("New grouped bundle")?.source).toContain("(steps");
    expect(generic("New grouped entity")?.source).toContain("(attributes");
    expect(generic("New grouped entity")?.source).toContain("(forms");
    expect(generic("New grouped entity")?.source).toContain("(actions");
    expect(generic("New attribute")?.source).toContain('(attr "case.priority"');
    expect(generic("New form")?.source).toContain("(form case_intake");
    expect(generic("New flow")?.source).toContain("(flow case_review");
    expect(generic("New action")?.source).toContain("(action assign_owner");

    const groupedBundle = generic("New grouped bundle");
    expect(groupedBundle).toBeDefined();
    const parsedGroupedBundle = parseAccountConfigSource(`(tenant grouped-demo "Grouped Demo" custom)
${groupedBundle!.source}`);
    expect(parsedGroupedBundle.error).toBeNull();
    expect(parsedGroupedBundle.diagnostics).toEqual([]);
    expect(parsedGroupedBundle.config).toMatchObject({
      attributes: expect.arrayContaining([
        expect.objectContaining({ name: "case.status" }),
      ]),
      entityTypes: expect.arrayContaining([
        expect.objectContaining({ name: "Case" }),
      ]),
      forms: expect.arrayContaining([
        expect.objectContaining({ form: "case_intake" }),
      ]),
      flows: expect.arrayContaining([
        expect.objectContaining({
          name: "case_review",
          steps: expect.arrayContaining([
            expect.objectContaining({ id: "intake", type: "collect" }),
          ]),
        }),
      ]),
      actions: expect.arrayContaining([
        expect.objectContaining({ name: "close_case" }),
      ]),
    });

    const groupedEntity = generic("New grouped entity");
    expect(groupedEntity).toBeDefined();
    const parsedGroupedEntity = parseAccountConfigSource(`(tenant grouped-entity-demo "Grouped Entity Demo" custom)
${groupedEntity!.source}`);
    expect(parsedGroupedEntity.error).toBeNull();
    expect(parsedGroupedEntity.diagnostics).toEqual([]);
    expect(parsedGroupedEntity.config).toMatchObject({
      attributes: expect.arrayContaining([
        expect.objectContaining({ name: "case.status" }),
      ]),
      entityTypes: expect.arrayContaining([
        expect.objectContaining({ name: "Case" }),
      ]),
      forms: expect.arrayContaining([
        expect.objectContaining({ form: "case_intake" }),
      ]),
      flows: expect.arrayContaining([
        expect.objectContaining({
          name: "case_review",
          steps: expect.arrayContaining([
            expect.objectContaining({ id: "intake", type: "collect" }),
          ]),
        }),
      ]),
      actions: expect.arrayContaining([
        expect.objectContaining({ name: "close_case" }),
      ]),
    });

    expect(suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Collect conflict_check step scoped to responsible.attorney",
          sourceAware: true,
          source: expect.stringContaining(
            '(step collect_conflict_check_responsible_attorney (collect "conflict_check" "responsible.attorney") done)',
          ),
        }),
        expect.objectContaining({
          label: "Action on Client setting matter.status=open",
          sourceAware: true,
          source: expect.stringContaining('"Client" "Set matter.status"'),
        }),
        expect.objectContaining({
          label: "Action on Matter setting matter.status=open",
          sourceAware: true,
          source: expect.stringContaining('"Matter" "Set matter.status"'),
        }),
        expect.objectContaining({
          label: "Open conflict_check action for Matter",
          sourceAware: true,
          source: expect.stringContaining('(opens-form "conflict_check" "client")'),
        }),
        expect.objectContaining({
          label: "Open conflict_check action for Matter scoped to responsible.attorney",
          sourceAware: true,
          source: expect.stringContaining(
            '(opens-form "conflict_check" "responsible.attorney")',
          ),
        }),
        expect.objectContaining({
          label: "Field for matter.status",
          sourceAware: true,
          source: '(field "matter.status" string "Matter Status")\n',
        }),
        expect.objectContaining({
          label: "Select field for matter.status",
          sourceAware: true,
          source: '(field "matter.status" select "Matter Status" ["open" "closed"])\n',
        }),
        expect.objectContaining({
          label: "Default select field for matter.status",
          sourceAware: true,
          source:
            '(field "matter.status" select "Matter Status" ["open" "closed"] (default-value "open"))\n',
        }),
        expect.objectContaining({
          label: "Form for Matter",
          sourceAware: true,
          source: expect.stringContaining(
            '(form matter_review "Review Matter" "Collects Matter review fields."',
          ),
          detail: "Drafts a Matter review form scoped by client.",
        }),
        expect.objectContaining({
          label: "Field for practice.area",
          sourceAware: true,
          source: '(field "practice.area" string "Practice Area")\n',
        }),
        expect.objectContaining({
          label: "Flow for Matter collecting conflict_check scoped to responsible.attorney",
          sourceAware: true,
          source: expect.stringContaining(
            '(flow matter_conflict_check_responsible_attorney "Matter" "Review Matter" "Collect conflict_check before review." collect_conflict_check_responsible_attorney',
          ),
        }),
        expect.objectContaining({
          label: "Branch on matter.status step",
          sourceAware: true,
          source: expect.stringContaining(
            '(branch route_matter_status [["?s" "matter.status" "open"]] set_matter_status done)',
          ),
        }),
        expect.objectContaining({
          label: "Notify responsible.attorney step",
          sourceAware: true,
          source: expect.stringContaining(
            '(notify notify_responsible_attorney "Notification sent" email "$arg.responsible.attorney" "notification-sent" (next done))',
          ),
        }),
        expect.objectContaining({
          label: "Delay review step",
          sourceAware: true,
          source: "(delay delay_review 300 (next done))\n",
        }),
        expect.objectContaining({
          label: "Flow for Client collecting conflict_check",
          sourceAware: true,
          source: expect.stringContaining(
            '(flow client_conflict_check "Client" "Review Client" "Collect conflict_check before review." collect_conflict_check',
          ),
        }),
      ]),
    );
    expect(suggestions.some((suggestion) => suggestion.label === "Field for client"))
      .toBe(false);
    expect(suggestions.some((suggestion) => suggestion.label === "Requirement for conflict_check"))
      .toBe(false);
    expect(
      suggestions.some((suggestion) => suggestion.label === "Guarded requirement for conflict_check"),
    ).toBe(false);
    expect(
      suggestions.some((suggestion) => suggestion.label.includes("scoped to matter.status")),
    ).toBe(false);
    const delaySuggestion = suggestions.find(
      (suggestion) => suggestion.label === "Delay review step",
    );
    expect(delaySuggestion).toBeDefined();
    const sourceWithSuggestedDelay = `${readFileSync("configs/accounts/legal-workflows.forma", "utf8")}
(flow delayed_review Matter "Delayed review" "Waits before completing review." delay_review
  ${delaySuggestion!.source.trim()}
  (done))
`;
    const parsedWithSuggestedDelay = parseAccountConfigSource(sourceWithSuggestedDelay);
    expect(parsedWithSuggestedDelay.error).toBeNull();
    expect(parsedWithSuggestedDelay.diagnostics).toEqual([]);
    expect(parsedWithSuggestedDelay.config).toMatchObject({
      flows: expect.arrayContaining([
        expect.objectContaining({
          name: "delayed_review",
          startStepId: "delay_review",
          steps: expect.arrayContaining([
            expect.objectContaining({
              id: "delay_review",
              type: "wait",
              config: { seconds: 300 },
              next: "done",
            }),
          ]),
        }),
      ]),
    });
    const flowSuggestion = suggestions.find(
      (suggestion) => suggestion.label === "Flow for Client collecting conflict_check",
    );
    expect(flowSuggestion).toBeDefined();
    const sourceWithSuggestedFlow = `${readFileSync("configs/accounts/legal-workflows.forma", "utf8")}\n${flowSuggestion!.source}`;
    const parsedWithSuggestedFlow = parseAccountConfigSource(sourceWithSuggestedFlow);
    expect(parsedWithSuggestedFlow.error).toBeNull();
    expect(parsedWithSuggestedFlow.diagnostics).toEqual([]);
    expect(parsedWithSuggestedFlow.config).toMatchObject({
      flows: expect.arrayContaining([
        expect.objectContaining({
          name: "client_conflict_check",
          subjectType: "Client",
          startStepId: "collect_conflict_check",
        }),
      ]),
    });
    const scopedFlowSuggestion = suggestions.find(
      (suggestion) =>
        suggestion.label ===
          "Flow for Matter collecting conflict_check scoped to responsible.attorney",
    );
    expect(scopedFlowSuggestion).toBeDefined();
    const sourceWithScopedSuggestedFlow = `${readFileSync("configs/accounts/legal-workflows.forma", "utf8")}\n${scopedFlowSuggestion!.source}`;
    const parsedWithScopedSuggestedFlow = parseAccountConfigSource(
      sourceWithScopedSuggestedFlow,
    );
    expect(parsedWithScopedSuggestedFlow.error).toBeNull();
    expect(parsedWithScopedSuggestedFlow.diagnostics).toEqual([]);
    expect(parsedWithScopedSuggestedFlow.config).toMatchObject({
      flows: expect.arrayContaining([
        expect.objectContaining({
          name: "matter_conflict_check_responsible_attorney",
          subjectType: "Matter",
          startStepId: "collect_conflict_check_responsible_attorney",
          steps: expect.arrayContaining([
            expect.objectContaining({
              id: "collect_conflict_check_responsible_attorney",
              type: "collect",
              config: expect.objectContaining({
                form: "conflict_check",
                scopeFrom: "responsible.attorney",
              }),
            }),
          ]),
        }),
      ]),
    });
    const actionSuggestion = suggestions.find(
      (suggestion) =>
        suggestion.label === "Action on Client setting matter.status=open",
    );
    expect(actionSuggestion).toBeDefined();
    expect(actionSuggestion!.source).toContain('(assert "matter.status" "open")');
    const sourceWithSuggestedAction = `${readFileSync("configs/accounts/legal-workflows.forma", "utf8")}\n${actionSuggestion!.source}`;
    const parsedWithSuggestedAction = parseAccountConfigSource(sourceWithSuggestedAction);
    expect(parsedWithSuggestedAction.error).toBeNull();
    expect(parsedWithSuggestedAction.diagnostics).toEqual([]);
    expect(parsedWithSuggestedAction.config).toMatchObject({
      actions: expect.arrayContaining([
        expect.objectContaining({
          name: "set_client_matter_status",
          appliesTo: "Client",
          asserts: { "matter.status": "open" },
        }),
      ]),
    });
    const matterActionSuggestion = suggestions.find(
      (suggestion) =>
        suggestion.label === "Action on Matter setting matter.status=open",
    );
    expect(matterActionSuggestion).toBeDefined();
    expect(matterActionSuggestion!.source).toContain('(assert "matter.status" "open")');
    const sourceWithSuggestedMatterAction = `${readFileSync("configs/accounts/legal-workflows.forma", "utf8")}\n${matterActionSuggestion!.source}`;
    const parsedWithSuggestedMatterAction = parseAccountConfigSource(
      sourceWithSuggestedMatterAction,
    );
    expect(parsedWithSuggestedMatterAction.error).toBeNull();
    expect(parsedWithSuggestedMatterAction.diagnostics).toEqual([]);
    expect(parsedWithSuggestedMatterAction.config).toMatchObject({
      actions: expect.arrayContaining([
        expect.objectContaining({
          name: "set_matter_status",
          appliesTo: "Matter",
          asserts: { "matter.status": "open" },
        }),
      ]),
    });
    const openFormActionSuggestion = suggestions.find(
      (suggestion) => suggestion.label === "Open conflict_check action for Matter",
    );
    expect(openFormActionSuggestion).toBeDefined();
    const sourceWithSuggestedOpenFormAction = `${readFileSync("configs/accounts/legal-workflows.forma", "utf8")}\n${openFormActionSuggestion!.source}`;
    const parsedWithSuggestedOpenFormAction = parseAccountConfigSource(sourceWithSuggestedOpenFormAction);
    expect(parsedWithSuggestedOpenFormAction.error).toBeNull();
    expect(parsedWithSuggestedOpenFormAction.diagnostics).toEqual([]);
    expect(parsedWithSuggestedOpenFormAction.config).toMatchObject({
      actions: expect.arrayContaining([
        expect.objectContaining({
          name: "open_conflict_check",
          appliesTo: "Matter",
          opensForm: { form: "conflict_check", scope: "client" },
        }),
      ]),
    });
    const scopedOpenFormActionSuggestion = suggestions.find(
      (suggestion) =>
        suggestion.label ===
          "Open conflict_check action for Matter scoped to responsible.attorney",
    );
    expect(scopedOpenFormActionSuggestion).toBeDefined();
    const sourceWithScopedOpenFormAction = `${readFileSync("configs/accounts/legal-workflows.forma", "utf8")}\n${scopedOpenFormActionSuggestion!.source}`;
    const parsedWithScopedOpenFormAction = parseAccountConfigSource(
      sourceWithScopedOpenFormAction,
    );
    expect(parsedWithScopedOpenFormAction.error).toBeNull();
    expect(parsedWithScopedOpenFormAction.diagnostics).toEqual([]);
    expect(parsedWithScopedOpenFormAction.config).toMatchObject({
      actions: expect.arrayContaining([
        expect.objectContaining({
          name: "open_conflict_check_responsible_attorney",
          appliesTo: "Matter",
          opensForm: { form: "conflict_check", scope: "responsible.attorney" },
        }),
      ]),
    });
    const fieldSuggestion = suggestions.find((suggestion) => suggestion.label === "Field for matter.status");
    expect(fieldSuggestion).toBeDefined();
    const sourceWithSuggestedField = `${readFileSync("configs/accounts/legal-workflows.forma", "utf8")}
(form status_update "Status Update"
  ${fieldSuggestion!.source.trim()})
`;
    const parsedWithSuggestedField = parseAccountConfigSource(sourceWithSuggestedField);
    expect(parsedWithSuggestedField.error).toBeNull();
    expect(parsedWithSuggestedField.diagnostics).toEqual([]);
    expect(parsedWithSuggestedField.config).toMatchObject({
      forms: expect.arrayContaining([
        expect.objectContaining({
          form: "status_update",
          fields: expect.arrayContaining([
            expect.objectContaining({
              name: "matter.status",
              type: "string",
              label: "Matter Status",
            }),
          ]),
        }),
      ]),
    });
    const selectFieldSuggestion = suggestions.find(
      (suggestion) => suggestion.label === "Select field for matter.status",
    );
    expect(selectFieldSuggestion).toBeDefined();
    const sourceWithSuggestedSelectField = `${readFileSync("configs/accounts/legal-workflows.forma", "utf8")}
(form status_select "Status Select"
  ${selectFieldSuggestion!.source.trim()})
`;
    const parsedWithSuggestedSelectField = parseAccountConfigSource(sourceWithSuggestedSelectField);
    expect(parsedWithSuggestedSelectField.error).toBeNull();
    expect(parsedWithSuggestedSelectField.diagnostics).toEqual([]);
    expect(parsedWithSuggestedSelectField.config).toMatchObject({
      forms: expect.arrayContaining([
        expect.objectContaining({
          form: "status_select",
          fields: expect.arrayContaining([
            expect.objectContaining({
              name: "matter.status",
              type: "select",
              label: "Matter Status",
              options: ["open", "closed"],
            }),
          ]),
        }),
      ]),
    });
    const defaultSelectFieldSuggestion = suggestions.find(
      (suggestion) => suggestion.label === "Default select field for matter.status",
    );
    expect(defaultSelectFieldSuggestion).toBeDefined();
    const sourceWithSuggestedDefaultSelectField = `${readFileSync("configs/accounts/legal-workflows.forma", "utf8")}
(form status_default "Status Default"
  ${defaultSelectFieldSuggestion!.source.trim()})
`;
    const parsedWithSuggestedDefaultSelectField = parseAccountConfigSource(
      sourceWithSuggestedDefaultSelectField,
    );
    expect(parsedWithSuggestedDefaultSelectField.error).toBeNull();
    expect(parsedWithSuggestedDefaultSelectField.diagnostics).toEqual([]);
    expect(parsedWithSuggestedDefaultSelectField.config).toMatchObject({
      forms: expect.arrayContaining([
        expect.objectContaining({
          form: "status_default",
          fields: expect.arrayContaining([
            expect.objectContaining({
              name: "matter.status",
              type: "select",
              label: "Matter Status",
              options: ["open", "closed"],
              defaultValue: "open",
            }),
          ]),
        }),
      ]),
    });
    const matterFormSuggestion = suggestions.find(
      (suggestion) => suggestion.label === "Form for Matter",
    );
    expect(matterFormSuggestion).toBeDefined();
    expect(matterFormSuggestion!.source).toContain(
      '(field "matter.status" select "Matter Status" ["open" "closed"])',
    );
    expect(matterFormSuggestion!.source).toContain(
      '(field "practice.area" string "Practice Area")',
    );
    expect(matterFormSuggestion!.source).toContain(
      '(requires "client" "Requires Matter review evidence for each Client scope.")',
    );
    expect(matterFormSuggestion!.source).not.toContain("responsible.attorney");
    const sourceWithSuggestedMatterForm = `${readFileSync("configs/accounts/legal-workflows.forma", "utf8")}
${matterFormSuggestion!.source}
`;
    const parsedWithSuggestedMatterForm = parseAccountConfigSource(
      sourceWithSuggestedMatterForm,
    );
    expect(parsedWithSuggestedMatterForm.error).toBeNull();
    expect(parsedWithSuggestedMatterForm.diagnostics).toEqual([]);
    expect(parsedWithSuggestedMatterForm.config).toMatchObject({
      forms: expect.arrayContaining([
        expect.objectContaining({
          form: "matter_review",
          title: "Review Matter",
          fields: expect.arrayContaining([
            expect.objectContaining({
              name: "matter.status",
              type: "select",
              options: ["open", "closed"],
            }),
            expect.objectContaining({
              name: "practice.area",
              type: "string",
            }),
          ]),
        }),
      ]),
      requirements: expect.arrayContaining([
        expect.objectContaining({
          form: "matter_review",
          scopeAttr: "client",
          description: "Requires Matter review evidence for each Client scope.",
        }),
      ]),
    });
    const sourceWithBooleanAttribute = `${readFileSync("configs/accounts/legal-workflows.forma", "utf8")}
(attr approved boolean)
`;
    const booleanSuggestions = formaCompletionSuggestions(
      parseAccountConfigSource(sourceWithBooleanAttribute).config,
    );
    const booleanFieldSuggestion = booleanSuggestions.find(
      (suggestion) => suggestion.label === "Required boolean field for approved",
    );
    expect(booleanFieldSuggestion).toBeDefined();
    const sourceWithSuggestedBooleanField = `${sourceWithBooleanAttribute}
(form approval_check "Approval Check"
  ${booleanFieldSuggestion!.source.trim()})
`;
    const parsedWithSuggestedBooleanField = parseAccountConfigSource(sourceWithSuggestedBooleanField);
    expect(parsedWithSuggestedBooleanField.error).toBeNull();
    expect(parsedWithSuggestedBooleanField.diagnostics).toEqual([]);
    expect(parsedWithSuggestedBooleanField.config).toMatchObject({
      forms: expect.arrayContaining([
        expect.objectContaining({
          form: "approval_check",
          fields: expect.arrayContaining([
            expect.objectContaining({
              name: "approved",
              type: "boolean",
              label: "Approved",
              required: true,
            }),
          ]),
        }),
      ]),
    });
    const branchSuggestion = suggestions.find(
      (suggestion) => suggestion.label === "Branch on matter.status step",
    );
    expect(branchSuggestion).toBeDefined();
    const indentedBranchSnippet = branchSuggestion!.source.trim().replace(/\n/g, "\n  ");
    const sourceWithSuggestedBranch = `${readFileSync("configs/accounts/legal-workflows.forma", "utf8")}
(flow matter_status_route Matter "Matter status route" "Routes a matter by status." route_matter_status
  ${indentedBranchSnippet}
  (done))
`;
    const parsedWithSuggestedBranch = parseAccountConfigSource(sourceWithSuggestedBranch);
    expect(parsedWithSuggestedBranch.error).toBeNull();
    expect(parsedWithSuggestedBranch.diagnostics).toEqual([]);
    expect(parsedWithSuggestedBranch.config).toMatchObject({
      flows: expect.arrayContaining([
        expect.objectContaining({
          name: "matter_status_route",
          startStepId: "route_matter_status",
          steps: expect.arrayContaining([
            expect.objectContaining({
              id: "route_matter_status",
              type: "branch",
              config: expect.objectContaining({
                where: [["?s", "matter.status", "open"]],
                ifTrue: "set_matter_status",
                ifFalse: "done",
              }),
            }),
            expect.objectContaining({
              id: "set_matter_status",
              type: "action",
              next: "done",
              config: expect.objectContaining({
                resultAttr: "matter.status",
                resultValue: "open",
              }),
            }),
          ]),
        }),
      ]),
    });
    const notifySuggestion = suggestions.find(
      (suggestion) => suggestion.label === "Notify responsible.attorney step",
    );
    expect(notifySuggestion).toBeDefined();
    const sourceWithSuggestedNotify = `${readFileSync("configs/accounts/legal-workflows.forma", "utf8")}
(flow matter_notify Matter "Matter notify" "Sends a matter notification." notify_responsible_attorney
  ${notifySuggestion!.source.trim()}
  (done))
`;
    const parsedWithSuggestedNotify = parseAccountConfigSource(sourceWithSuggestedNotify);
    expect(parsedWithSuggestedNotify.error).toBeNull();
    expect(parsedWithSuggestedNotify.diagnostics).toEqual([]);
    expect(parsedWithSuggestedNotify.config).toMatchObject({
      flows: expect.arrayContaining([
        expect.objectContaining({
          name: "matter_notify",
          startStepId: "notify_responsible_attorney",
          steps: expect.arrayContaining([
            expect.objectContaining({
              id: "notify_responsible_attorney",
              type: "notify",
              next: "done",
              config: expect.objectContaining({
                message: "Notification sent",
                channel: "email",
                to: "$arg.responsible.attorney",
                template: "notification-sent",
              }),
            }),
          ]),
        }),
      ]),
    });
    const sourceWithExtraForm = `${readFileSync("configs/accounts/legal-workflows.forma", "utf8")}
(form risk_review "Risk Review"
  (field cleared boolean "Risk cleared" (required)))
`;
    const parsedWithExtraForm = parseAccountConfigSource(sourceWithExtraForm);
    expect(parsedWithExtraForm.error).toBeNull();
    const extraFormSuggestions = formaCompletionSuggestions(parsedWithExtraForm.config);
    expect(extraFormSuggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Requirement for risk_review",
          sourceAware: true,
          source: expect.stringContaining('(requires "risk_review" "client")'),
        }),
        expect.objectContaining({
          label: "Requirement for risk_review scoped to responsible.attorney",
          sourceAware: true,
          source: expect.stringContaining(
            '(requires "risk_review" "responsible.attorney")',
          ),
        }),
        expect.objectContaining({
          label: "Guarded requirement for risk_review",
          sourceAware: true,
          source: expect.stringContaining(
            '(requires "risk_review" "client" (when "matter.status" "open"))',
          ),
        }),
        expect.objectContaining({
          label: "Guarded requirement for risk_review scoped to responsible.attorney",
          sourceAware: true,
          source: expect.stringContaining(
            '(requires "risk_review" "responsible.attorney" (when "matter.status" "open"))',
          ),
        }),
      ]),
    );
    const guardedRequirementSuggestion = extraFormSuggestions.find(
      (suggestion) => suggestion.label === "Guarded requirement for risk_review",
    );
    expect(guardedRequirementSuggestion).toBeDefined();
    const sourceWithGuardedRequirement = `${sourceWithExtraForm}\n${guardedRequirementSuggestion!.source}`;
    const parsedWithGuardedRequirement = parseAccountConfigSource(sourceWithGuardedRequirement);
    expect(parsedWithGuardedRequirement.error).toBeNull();
    expect(parsedWithGuardedRequirement.diagnostics).toEqual([]);
    expect(parsedWithGuardedRequirement.config).toMatchObject({
      requirements: expect.arrayContaining([
        expect.objectContaining({
          form: "risk_review",
          scopeAttr: "client",
          guard: ["matter.status", "open"],
        }),
      ]),
    });
    const attorneyRequirementSuggestion = extraFormSuggestions.find(
      (suggestion) =>
        suggestion.label === "Requirement for risk_review scoped to responsible.attorney",
    );
    expect(attorneyRequirementSuggestion).toBeDefined();
    const sourceWithAttorneyRequirement = `${sourceWithExtraForm}\n${attorneyRequirementSuggestion!.source}`;
    const parsedWithAttorneyRequirement = parseAccountConfigSource(sourceWithAttorneyRequirement);
    expect(parsedWithAttorneyRequirement.error).toBeNull();
    expect(parsedWithAttorneyRequirement.diagnostics).toEqual([]);
    expect(parsedWithAttorneyRequirement.config).toMatchObject({
      requirements: expect.arrayContaining([
        expect.objectContaining({
          form: "risk_review",
          scopeAttr: "responsible.attorney",
        }),
      ]),
    });
    const attorneyCollectSuggestion = suggestions.find(
      (suggestion) =>
        suggestion.label === "Collect conflict_check step scoped to responsible.attorney",
    );
    expect(attorneyCollectSuggestion).toBeDefined();
    const sourceWithAttorneyCollect = `${readFileSync("configs/accounts/legal-workflows.forma", "utf8")}
(flow attorney_conflict_check Matter "Attorney conflict check" "Collects a conflict check by attorney scope." collect_conflict_check_responsible_attorney
  ${attorneyCollectSuggestion!.source.trim()}
  (done))
`;
    const parsedWithAttorneyCollect = parseAccountConfigSource(sourceWithAttorneyCollect);
    expect(parsedWithAttorneyCollect.error).toBeNull();
    expect(parsedWithAttorneyCollect.diagnostics).toEqual([]);
    expect(parsedWithAttorneyCollect.config).toMatchObject({
      flows: expect.arrayContaining([
        expect.objectContaining({
          name: "attorney_conflict_check",
          startStepId: "collect_conflict_check_responsible_attorney",
          steps: expect.arrayContaining([
            expect.objectContaining({
              id: "collect_conflict_check_responsible_attorney",
              type: "collect",
              config: expect.objectContaining({
                form: "conflict_check",
                scopeFrom: "responsible.attorney",
              }),
            }),
          ]),
        }),
      ]),
    });
    const sourceWithPriorityGuard = `(tenant priority-demo "Priority Demo" custom)
(attr client entityRef)
(attr "case.priority" string)
(entity Case [client "case.priority"])
(form priority_review "Priority Review"
  (field approved boolean "Approved"))
`;
    const priorityGuardSuggestions = formaCompletionSuggestions(
      parseAccountConfigSource(sourceWithPriorityGuard).config,
    );
    expect(priorityGuardSuggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Guarded requirement for priority_review",
          source: expect.stringContaining(
            '(requires "priority_review" "client" (when "case.priority" "medium"))',
          ),
        }),
      ]),
    );
    const sourceWithGeneratedResources = `${readFileSync("configs/accounts/legal-workflows.forma", "utf8")}
(flow custom_conflict_collection Matter "Review Matter" "Collect conflict_check before review." collect_conflict_check
  (step collect_conflict_check (collect conflict_check client) done)
  (step done (done)))
(flow custom_engagement_collection Matter "Review Matter" "Collect engagement_letter before review." custom_engagement_step
  (step custom_engagement_step (collect engagement_letter client) done)
  (step done (done)))
(flow custom_attorney_notification Matter "Notify attorney" "Sends a notification." custom_notify_attorney
  (notify custom_notify_attorney "Notification sent" email "$arg.responsible.attorney" "notification-sent" (next done))
  (done))
(flow custom_status_route Matter "Route by status" "Routes a matter by status." custom_route_status
  (branch custom_route_status [["?s" "matter.status" "open"]] custom_set_status done)
  (action custom_set_status "Set matter.status" "matter.status" "open" (next done))
  (done))
(action custom_status_value Matter "Set matter.status"
  (assert "matter.status" "value"))
(action custom_activate_matter Matter "Activate matter"
  (assert "matter.status" "open"))
(action launch_conflict_check Matter "Open Conflict Check"
  (opens-form conflict_check client))
(action request_attorney_conflict Matter "Request Attorney Conflict Check"
  (opens-form conflict_check "responsible.attorney"))
(form matter_review "Matter Review"
  (field "matter.status" select "Matter Status" ["open" "closed"]))
(flow generated_step_ids Matter "Generated step ids" "Existing generated step ids." notify_responsible_attorney
  (notify notify_responsible_attorney "Notification sent" email "$arg.responsible.attorney" "notification-sent" (next done))
  (delay custom_delay_review 300 (next done))
  (done))
`;
    const parsedWithGeneratedResources = parseAccountConfigSource(sourceWithGeneratedResources);
    expect(parsedWithGeneratedResources.error).toBeNull();
    expect(parsedWithGeneratedResources.diagnostics).toEqual([]);
    const duplicateAwareSuggestions = formaCompletionSuggestions(parsedWithGeneratedResources.config);
    expectUniqueCompletionLabels(duplicateAwareSuggestions);
    expect(
      duplicateAwareSuggestions.some((suggestion) =>
        suggestion.label === "Flow for Matter collecting conflict_check" &&
        suggestion.source.includes("matter_conflict_check "),
      ),
    ).toBe(false);
    expect(
      duplicateAwareSuggestions.some((suggestion) =>
        suggestion.label ===
          "Flow for Matter collecting conflict_check scoped to responsible.attorney" &&
        suggestion.source.includes("matter_conflict_check_responsible_attorney"),
      ),
    ).toBe(true);
    expect(
      duplicateAwareSuggestions.some(
        (suggestion) =>
          suggestion.label === "Collect conflict_check step" &&
          suggestion.source.includes("collect_conflict_check "),
      ),
    ).toBe(false);
    expect(
      duplicateAwareSuggestions.some(
        (suggestion) =>
          suggestion.label === "Collect conflict_check step scoped to responsible.attorney" &&
          suggestion.source.includes("collect_conflict_check_responsible_attorney"),
      ),
    ).toBe(true);
    expect(
      duplicateAwareSuggestions.some(
        (suggestion) =>
          suggestion.label === "Collect engagement_letter step" &&
          suggestion.source.includes("collect_engagement_letter "),
      ),
    ).toBe(false);
    expect(
      duplicateAwareSuggestions.some(
        (suggestion) =>
          suggestion.label === "Action on Matter setting matter.status=open",
      ),
    )
      .toBe(false);
    expect(
      duplicateAwareSuggestions.some((suggestion) =>
        suggestion.label === "Open conflict_check action for Matter",
      ),
    ).toBe(false);
    expect(
      duplicateAwareSuggestions.some((suggestion) =>
        suggestion.label === "Open conflict_check action for Matter scoped to responsible.attorney",
      ),
    ).toBe(false);
    expect(
      duplicateAwareSuggestions.some((suggestion) => suggestion.label === "Form for Matter"),
    ).toBe(false);
    expect(
      duplicateAwareSuggestions.some((suggestion) =>
        suggestion.label === "Branch on matter.status step",
      ),
    ).toBe(false);
    expect(
      duplicateAwareSuggestions.some((suggestion) =>
        suggestion.label === "Notify responsible.attorney step",
      ),
    ).toBe(false);
    expect(
      duplicateAwareSuggestions.some((suggestion) =>
        suggestion.label === "Delay review step",
      ),
    ).toBe(false);
    expect(suggestions.some((suggestion) => !suggestion.sourceAware)).toBe(true);
  });

  it("emits type-correct Forma literals in generated completion snippets", () => {
    const booleanSource = `(tenant typed-demo "Typed Demo" custom)
(attr client entityRef)
(attr approved boolean)
(entity Case [client approved])
(form approval_review "Approval Review"
  (field approved boolean "Approved"))
`;
    const booleanParsed = parseAccountConfigSource(booleanSource);
    expect(booleanParsed.error).toBeNull();
    const booleanSuggestions = formaCompletionSuggestions(booleanParsed.config);
    const booleanGuard = booleanSuggestions.find(
      (suggestion) => suggestion.label === "Guarded requirement for approval_review",
    );
    const booleanBranch = booleanSuggestions.find(
      (suggestion) => suggestion.label === "Branch on approved step",
    );
    const booleanAction = booleanSuggestions.find(
      (suggestion) => suggestion.label === "Action on Case setting approved=true",
    );
    const booleanDefaultField = booleanSuggestions.find(
      (suggestion) => suggestion.label === "Default boolean field for approved",
    );

    expect(booleanGuard?.source).toContain('(when "approved" true)');
    expect(booleanBranch?.source).toContain('[["?s" "approved" true]]');
    expect(booleanAction?.source).toContain('(assert "approved" true)');
    expect(booleanDefaultField?.source).toBe(
      '(field "approved" boolean "Approved" (default-value true))\n',
    );

    const parsedBooleanSnippets = parseAccountConfigSource(`${booleanSource}
${booleanGuard!.source}
(flow approval_route Case "Approval route" "Routes by approval." route_approved
  ${booleanBranch!.source.trim().replace(/\n/g, "\n  ")}
  (done))
${booleanAction!.source}
(form approval_default "Approval Default"
  ${booleanDefaultField!.source.trim()})
`);
    expect(parsedBooleanSnippets.error).toBeNull();
    expect(parsedBooleanSnippets.diagnostics).toEqual([]);
    expect(parsedBooleanSnippets.config).toMatchObject({
      requirements: expect.arrayContaining([
        expect.objectContaining({ guard: ["approved", true] }),
      ]),
      flows: expect.arrayContaining([
        expect.objectContaining({
          steps: expect.arrayContaining([
            expect.objectContaining({
              id: "route_approved",
              config: expect.objectContaining({
                where: [["?s", "approved", true]],
              }),
            }),
            expect.objectContaining({
              id: "set_approved",
              config: expect.objectContaining({
                resultAttr: "approved",
                resultValue: true,
              }),
            }),
          ]),
        }),
      ]),
      actions: expect.arrayContaining([
        expect.objectContaining({ asserts: { approved: true } }),
      ]),
      forms: expect.arrayContaining([
        expect.objectContaining({
          form: "approval_default",
          fields: expect.arrayContaining([
            expect.objectContaining({
              name: "approved",
              type: "boolean",
              defaultValue: true,
            }),
          ]),
        }),
      ]),
    });

    const numberSource = `(tenant typed-demo "Typed Demo" custom)
(attr client entityRef)
(attr "risk.score" number)
(entity Case [client "risk.score"])
(form risk_review "Risk Review"
  (field "risk.score" number "Risk Score"))
`;
    const numberParsed = parseAccountConfigSource(numberSource);
    expect(numberParsed.error).toBeNull();
    const numberSuggestions = formaCompletionSuggestions(numberParsed.config);
    const numberGuard = numberSuggestions.find(
      (suggestion) => suggestion.label === "Guarded requirement for risk_review",
    );
    const numberBranch = numberSuggestions.find(
      (suggestion) => suggestion.label === "Branch on risk.score step",
    );
    const numberAction = numberSuggestions.find(
      (suggestion) => suggestion.label === "Action on Case setting risk.score=1",
    );
    const numberDefaultField = numberSuggestions.find(
      (suggestion) => suggestion.label === "Default number field for risk.score",
    );

    expect(numberGuard?.source).toContain('(when "risk.score" 1)');
    expect(numberBranch?.source).toContain('[["?s" "risk.score" 1]]');
    expect(numberAction?.source).toContain('(assert "risk.score" 1)');
    expect(numberDefaultField?.source).toBe(
      '(field "risk.score" number "Risk Score" (default-value 1))\n',
    );

    const parsedNumberSnippets = parseAccountConfigSource(`${numberSource}
${numberGuard!.source}
(flow risk_route Case "Risk route" "Routes by score." route_risk_score
  ${numberBranch!.source.trim().replace(/\n/g, "\n  ")}
  (done))
${numberAction!.source}
(form risk_default "Risk Default"
  ${numberDefaultField!.source.trim()})
`);
    expect(parsedNumberSnippets.error).toBeNull();
    expect(parsedNumberSnippets.diagnostics).toEqual([]);
    expect(parsedNumberSnippets.config).toMatchObject({
      requirements: expect.arrayContaining([
        expect.objectContaining({ guard: ["risk.score", 1] }),
      ]),
      flows: expect.arrayContaining([
        expect.objectContaining({
          steps: expect.arrayContaining([
            expect.objectContaining({
              id: "route_risk_score",
              config: expect.objectContaining({
                where: [["?s", "risk.score", 1]],
              }),
            }),
            expect.objectContaining({
              id: "set_risk_score",
              config: expect.objectContaining({
                resultAttr: "risk.score",
                resultValue: 1,
              }),
            }),
          ]),
        }),
      ]),
      actions: expect.arrayContaining([
        expect.objectContaining({ asserts: { "risk.score": 1 } }),
      ]),
      forms: expect.arrayContaining([
        expect.objectContaining({
          form: "risk_default",
          fields: expect.arrayContaining([
            expect.objectContaining({
              name: "risk.score",
              type: "number",
              defaultValue: 1,
            }),
          ]),
        }),
      ]),
    });

    const dateSource = `(tenant typed-demo "Typed Demo" custom)
(attr client entityRef)
(attr "review.date" date)
(entity Case [client "review.date"])
`;
    const dateParsed = parseAccountConfigSource(dateSource);
    expect(dateParsed.error).toBeNull();
    const dateSuggestions = formaCompletionSuggestions(dateParsed.config);
    const dateDefaultField = dateSuggestions.find(
      (suggestion) => suggestion.label === "Default date field for review.date",
    );

    expect(dateDefaultField?.source).toBe(
      '(field "review.date" date "Review Date" (default-value "2026-01-01"))\n',
    );

    const parsedDateSnippets = parseAccountConfigSource(`${dateSource}
(form review_default "Review Default"
  ${dateDefaultField!.source.trim()})
`);
    expect(parsedDateSnippets.error).toBeNull();
    expect(parsedDateSnippets.diagnostics).toEqual([]);
    expect(parsedDateSnippets.config).toMatchObject({
      forms: expect.arrayContaining([
        expect.objectContaining({
          form: "review_default",
          fields: expect.arrayContaining([
            expect.objectContaining({
              name: "review.date",
              type: "date",
              defaultValue: "2026-01-01",
            }),
          ]),
        }),
      ]),
    });
  });

  it("suggests a compact terminal done step when workflows do not already define one", () => {
    const source = `(tenant done-demo "Done Demo" custom)
(attr client entityRef)
(entity Case [client])
(flow case_review Case "Case review" "Reviews a case." start
  (notify start "Started" email "$arg.client" "started"))`;
    const parsed = parseAccountConfigSource(source);
    expect(parsed.error).toBeNull();
    expect(parsed.diagnostics).toEqual([]);

    const suggestions = formaCompletionSuggestions(parsed.config);
    const doneSuggestion = suggestions.find((suggestion) => suggestion.label === "Done step");
    expect(doneSuggestion).toEqual(
      expect.objectContaining({
        detail: "Terminal workflow step for compact flow authoring.",
        sourceAware: true,
        source: "(done)\n",
      }),
    );

    const withDone = parseAccountConfigSource(`${source.replace(
      '  (notify start "Started" email "$arg.client" "started"))',
      '  (notify start "Started" email "$arg.client" "started" (next done))',
    )}
  ${doneSuggestion!.source.trim()})`);
    expect(withDone.error).toBeNull();
    expect(withDone.diagnostics).toEqual([]);
    expect(withDone.config).toMatchObject({
      flows: expect.arrayContaining([
        expect.objectContaining({
          name: "case_review",
          steps: expect.arrayContaining([
            expect.objectContaining({
              id: "done",
              type: "done",
            }),
          ]),
        }),
      ]),
    });

    expect(
      formaCompletionSuggestions(withDone.config).some(
        (suggestion) => suggestion.label === "Done step",
      ),
    ).toBe(false);
  });

  it("emits required field completion variants for scalar and select attributes", () => {
    const source = `(tenant required-demo "Required Demo" custom)
(attr client entityRef)
(attr "practice.area" string)
(attr "matter.status" string)
(attr "i9/citizenship" string)
(attr "worker.status" string)
(attr "everify.status" string)
(attr "risk.score" number)
(attr "review.date" date)
(entity Matter [client "practice.area" "matter.status" "i9/citizenship" "worker.status" "everify.status" "risk.score" "review.date"])`;
    const parsed = parseAccountConfigSource(source);
    expect(parsed.error).toBeNull();
    expect(parsed.diagnostics).toEqual([]);
    const suggestions = formaCompletionSuggestions(parsed.config);

    const requiredString = suggestions.find(
      (suggestion) => suggestion.label === "Required string field for practice.area",
    );
    const requiredSelect = suggestions.find(
      (suggestion) => suggestion.label === "Required select field for matter.status",
    );
    const requiredNumber = suggestions.find(
      (suggestion) => suggestion.label === "Required number field for risk.score",
    );
    const requiredDate = suggestions.find(
      (suggestion) => suggestion.label === "Required date field for review.date",
    );
    const citizenshipSelect = suggestions.find(
      (suggestion) => suggestion.label === "Select field for i9/citizenship",
    );
    const requiredCitizenshipSelect = suggestions.find(
      (suggestion) => suggestion.label === "Required select field for i9/citizenship",
    );
    const workerStatusSelect = suggestions.find(
      (suggestion) => suggestion.label === "Select field for worker.status",
    );
    const defaultWorkerStatusSelect = suggestions.find(
      (suggestion) => suggestion.label === "Default select field for worker.status",
    );
    const everifyStatusSelect = suggestions.find(
      (suggestion) => suggestion.label === "Select field for everify.status",
    );
    const defaultEverifyStatusSelect = suggestions.find(
      (suggestion) => suggestion.label === "Default select field for everify.status",
    );

    expect(requiredString?.source).toBe(
      '(field "practice.area" string "Practice Area" (required))\n',
    );
    expect(requiredSelect?.source).toBe(
      '(field "matter.status" select "Matter Status" ["open" "closed"] (required))\n',
    );
    expect(requiredNumber?.source).toBe(
      '(field "risk.score" number "Risk Score" (required))\n',
    );
    expect(requiredDate?.source).toBe(
      '(field "review.date" date "Review Date" (required))\n',
    );
    expect(citizenshipSelect?.source).toBe(
      '(field "i9/citizenship" select "I-9 Citizenship" ["citizen" "permanent_resident" "authorized_alien"])\n',
    );
    expect(requiredCitizenshipSelect?.source).toBe(
      '(field "i9/citizenship" select "I-9 Citizenship" ["citizen" "permanent_resident" "authorized_alien"] (required))\n',
    );
    expect(workerStatusSelect?.source).toBe(
      '(field "worker.status" select "Worker Status" ["active" "terminated"])\n',
    );
    expect(defaultWorkerStatusSelect?.source).toBe(
      '(field "worker.status" select "Worker Status" ["active" "terminated"] (default-value "active"))\n',
    );
    expect(everifyStatusSelect?.source).toBe(
      '(field "everify.status" select "E-Verify Status" ["pending" "verified" "needs_review"])\n',
    );
    expect(defaultEverifyStatusSelect?.source).toBe(
      '(field "everify.status" select "E-Verify Status" ["pending" "verified" "needs_review"] (default-value "pending"))\n',
    );

    const withRequiredFields = parseAccountConfigSource(`${source}
(form required_review "Required Review"
  ${requiredString!.source.trim()}
  ${requiredSelect!.source.trim()}
  ${requiredCitizenshipSelect!.source.trim()}
  ${workerStatusSelect!.source.trim()}
  ${everifyStatusSelect!.source.trim()}
  ${requiredNumber!.source.trim()}
  ${requiredDate!.source.trim()})`);
    expect(withRequiredFields.error).toBeNull();
    expect(withRequiredFields.diagnostics).toEqual([]);
    expect(withRequiredFields.config).toMatchObject({
      forms: expect.arrayContaining([
        expect.objectContaining({
          form: "required_review",
          fields: expect.arrayContaining([
            expect.objectContaining({ name: "practice.area", required: true }),
            expect.objectContaining({
              name: "matter.status",
              type: "select",
              options: ["open", "closed"],
              required: true,
            }),
            expect.objectContaining({
              name: "i9/citizenship",
              type: "select",
              options: ["citizen", "permanent_resident", "authorized_alien"],
              required: true,
            }),
            expect.objectContaining({
              name: "worker.status",
              type: "select",
              options: ["active", "terminated"],
            }),
            expect.objectContaining({
              name: "everify.status",
              type: "select",
              options: ["pending", "verified", "needs_review"],
            }),
            expect.objectContaining({ name: "risk.score", required: true }),
            expect.objectContaining({ name: "review.date", required: true }),
          ]),
        }),
      ]),
    });

    const matterFormSuggestion = suggestions.find(
      (suggestion) => suggestion.label === "Form for Matter",
    );
    expect(matterFormSuggestion?.source).toContain(
      '(field "i9/citizenship" select "I-9 Citizenship" ["citizen" "permanent_resident" "authorized_alien"])',
    );
    expect(matterFormSuggestion?.source).toContain(
      '(field "worker.status" select "Worker Status" ["active" "terminated"])',
    );
    expect(matterFormSuggestion?.source).toContain(
      '(field "everify.status" select "E-Verify Status" ["pending" "verified" "needs_review"])',
    );
  });

  it("uses completed E-Verify values for generated branch and action assertions", () => {
    const source = `(tenant everify-demo "E-Verify Demo" staffing)
(attr employer entityRef)
(attr "everify.status" string)
(entity Worker [employer "everify.status"])
(form everify_review "E-Verify Review"
  (field "everify.status" select "E-Verify Status" ["pending" "verified" "needs_review"] (default-value "pending")))`;
    const parsed = parseAccountConfigSource(source);
    expect(parsed.error).toBeNull();
    expect(parsed.diagnostics).toEqual([]);

    const suggestions = formaCompletionSuggestions(parsed.config);
    const defaultField = suggestions.find(
      (suggestion) => suggestion.label === "Default select field for everify.status",
    );
    const branchStep = suggestions.find(
      (suggestion) => suggestion.label === "Branch on everify.status step",
    );
    const action = suggestions.find(
      (suggestion) => suggestion.label === "Action on Worker setting everify.status=verified",
    );

    expect(defaultField?.source).toContain('(default-value "pending")');
    expect(branchStep?.source).toContain(
      '(branch route_everify_status [["?s" "everify.status" "verified"]] set_everify_status done)',
    );
    expect(branchStep?.source).toContain(
      '(action set_everify_status "Set everify.status" "everify.status" "verified" (next done))',
    );
    expect(action?.source).toContain('(assert "everify.status" "verified")');

    const withGeneratedAction = parseAccountConfigSource(`${source}
${action!.source.trim()}`);
    expect(withGeneratedAction.error).toBeNull();
    expect(withGeneratedAction.diagnostics).toEqual([]);
    expect(withGeneratedAction.config).toMatchObject({
      actions: expect.arrayContaining([
        expect.objectContaining({
          name: "set_everify_status",
          appliesTo: "Worker",
          asserts: { "everify.status": "verified" },
        }),
      ]),
    });

    const withGeneratedBranch = parseAccountConfigSource(`${source}
(flow everify_route Worker "E-Verify Route" "Routes by verified E-Verify status." route_everify_status
  ${branchStep!.source.trim()}
  (done))`);
    expect(withGeneratedBranch.error).toBeNull();
    expect(withGeneratedBranch.diagnostics).toEqual([]);
    expect(withGeneratedBranch.config).toMatchObject({
      flows: expect.arrayContaining([
        expect.objectContaining({
          name: "everify_route",
          steps: expect.arrayContaining([
            expect.objectContaining({
              id: "route_everify_status",
              type: "branch",
              config: expect.objectContaining({
                where: [["?s", "everify.status", "verified"]],
              }),
            }),
            expect.objectContaining({
              id: "set_everify_status",
              type: "action",
              config: expect.objectContaining({
                resultAttr: "everify.status",
                resultValue: "verified",
              }),
            }),
          ]),
        }),
      ]),
    });
  });

  it("emits PII field completion variants for sensitive string and date attributes", () => {
    const source = `(tenant pii-demo "PII Demo" custom)
(attr client entityRef)
(attr ssn string)
(attr "contact.email" string)
(attr "birth.date" date)
(attr "matter.status" string)
(entity Worker [client ssn "contact.email" "birth.date" "matter.status"])`;
    const parsed = parseAccountConfigSource(source);
    expect(parsed.error).toBeNull();
    expect(parsed.diagnostics).toEqual([]);
    const suggestions = formaCompletionSuggestions(parsed.config);

    const ssnField = suggestions.find(
      (suggestion) => suggestion.label === "PII string field for ssn",
    );
    const requiredSsnField = suggestions.find(
      (suggestion) => suggestion.label === "Required PII string field for ssn",
    );
    const emailField = suggestions.find(
      (suggestion) => suggestion.label === "PII string field for contact.email",
    );
    const birthDateField = suggestions.find(
      (suggestion) => suggestion.label === "PII date field for birth.date",
    );
    const requiredBirthDateField = suggestions.find(
      (suggestion) => suggestion.label === "Required PII date field for birth.date",
    );

    expect(ssnField?.source).toBe('(field "ssn" string "SSN" (pii))\n');
    expect(requiredSsnField?.source).toBe(
      '(field "ssn" string "SSN" (required) (pii))\n',
    );
    expect(emailField?.source).toBe(
      '(field "contact.email" string "Contact Email" (pii))\n',
    );
    expect(birthDateField?.source).toBe(
      '(field "birth.date" date "Birth Date" (pii))\n',
    );
    expect(requiredBirthDateField?.source).toBe(
      '(field "birth.date" date "Birth Date" (required) (pii))\n',
    );
    expect(
      suggestions.some((suggestion) => suggestion.label === "PII string field for matter.status"),
    ).toBe(false);

    const withPiiFields = parseAccountConfigSource(`${source}
(form pii_review "PII Review"
  ${ssnField!.source.trim()}
  ${emailField!.source.trim()}
  ${birthDateField!.source.trim()})
(form required_pii_review "Required PII Review"
  ${requiredSsnField!.source.trim()}
  ${requiredBirthDateField!.source.trim()})`);
    expect(withPiiFields.error).toBeNull();
    expect(withPiiFields.diagnostics).toEqual([]);
    expect(withPiiFields.config).toMatchObject({
      forms: expect.arrayContaining([
        expect.objectContaining({
          form: "pii_review",
          fields: expect.arrayContaining([
            expect.objectContaining({ name: "ssn", pii: true }),
            expect.objectContaining({ name: "contact.email", pii: true }),
            expect.objectContaining({ name: "birth.date", type: "date", pii: true }),
          ]),
        }),
        expect.objectContaining({
          form: "required_pii_review",
          fields: expect.arrayContaining([
            expect.objectContaining({ name: "ssn", required: true, pii: true }),
            expect.objectContaining({
              name: "birth.date",
              type: "date",
              required: true,
              pii: true,
            }),
          ]),
        }),
      ]),
    });

    const workerFormSuggestion = suggestions.find(
      (suggestion) => suggestion.label === "Form for Worker",
    );
    expect(workerFormSuggestion).toBeDefined();
    expect(workerFormSuggestion!.source).toContain('(field "ssn" string "SSN" (pii))');
    expect(workerFormSuggestion!.source).toContain(
      '(field "contact.email" string "Contact Email" (pii))',
    );
    expect(workerFormSuggestion!.source).toContain(
      '(field "birth.date" date "Birth Date" (pii))',
    );
    expect(workerFormSuggestion!.source).toContain(
      '(field "matter.status" select "Matter Status" ["open" "closed"])',
    );
    const withGeneratedPiiForm = parseAccountConfigSource(`${source}
${workerFormSuggestion!.source}`);
    expect(withGeneratedPiiForm.error).toBeNull();
    expect(withGeneratedPiiForm.diagnostics).toEqual([]);
    expect(withGeneratedPiiForm.config).toMatchObject({
      forms: expect.arrayContaining([
        expect.objectContaining({
          form: "worker_review",
          fields: expect.arrayContaining([
            expect.objectContaining({ name: "ssn", pii: true }),
            expect.objectContaining({ name: "contact.email", pii: true }),
            expect.objectContaining({ name: "birth.date", type: "date", pii: true }),
            expect.objectContaining({
              name: "matter.status",
              type: "select",
            }),
          ]),
        }),
      ]),
    });
    const generatedConfig = withGeneratedPiiForm.config as {
      forms?: Array<{ form?: string; fields?: Array<{ name?: string; pii?: boolean }> }>;
    };
    const generatedWorkerForm = generatedConfig.forms?.find(
      (form) => form.form === "worker_review",
    );
    const statusField = generatedWorkerForm?.fields?.find(
      (field) => field.name === "matter.status",
    );
    expect(statusField?.pii).toBeUndefined();
  });

  it("emits Mermaid graph review metadata from parsed account config", () => {
    const parsed = parseAccountConfigSource(
      readFileSync("configs/accounts/legal-workflows.forma", "utf8"),
    );

    expect(parsed.config).not.toBeNull();
    const edges = accountConfigResourceGraph(parsed.config);
    const mermaid = accountConfigResourceGraphMermaid(parsed.config, edges);

    expect(mermaid).toContain("graph LR");
    expect(mermaid).toContain("%% account: Legal Workflows / legal-workflows");
    expect(mermaid).toContain('entityType_Matter["entityType: Matter"]');
    expect(mermaid).toContain('-- "flow" --> flow_matter_intake');
  });

  it("returns source-located Forma diagnostics with a usable config", () => {
    const parsed = parseAccountConfigSource(`
(account (slug "legal-workflows") (name "Legal Workflows") (kind legal))
(entity Matter
  (attr "matter.status" (value-type string) (cardinality one))
  (requirement conflict_check (scope-attr client)))
`);

    expect(parsed.error).toBeNull();
    expect(parsed.format).toBe("forma");
    expect(parsed.config).toEqual(expect.any(Object));
    expect(parsed.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "requirement references unknown form conflict_check",
          path: "requirement:conflict_check",
          loc: expect.objectContaining({ line: 5, col: 3 }),
        }),
      ]),
    );
  });

  it("adds first and duplicate line hints to Forma duplicate diagnostics", () => {
    const parsed = parseAccountConfigSource(`(tenant "legal-workflows" "Legal Workflows" "legal")
(attr "matter.status" string)
(attr "matter.status" string)
(form conflict_check "Conflict Check"
  (field cleared boolean "Conflict cleared")
  (field cleared boolean "Conflict cleared again"))
`);

    expect(parsed.error).toBeNull();
    expect(parsed.config).toEqual(expect.any(Object));
    expect(parsed.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message:
            "duplicate attribute: matter.status (first defined on line 2, duplicate on line 3)",
          path: "attribute:matter.status",
          loc: expect.objectContaining({ line: 3, col: 1 }),
        }),
        expect.objectContaining({
          message:
            "duplicate form conflict_check field: cleared (first defined on line 5, duplicate on line 6)",
          path: "formField:conflict_check:cleared",
          loc: expect.objectContaining({ line: 6, col: 3 }),
        }),
      ]),
    );
  });

  it("reports both JSON and YAML parser failures", () => {
    const parsed = parseAccountConfigSource("account: [");

    expect(parsed.config).toBeNull();
    expect(parsed.format).toBeNull();
    expect(parsed.error).toContain("JSON:");
    expect(parsed.error).toContain("YAML:");
    expect(parsed.diagnostics.length).toBeGreaterThan(0);
  });

  it("does not accept YAML scalar text as account config", () => {
    const parsed = parseAccountConfigSource("not a config");

    expect(parsed.config).toBeNull();
    expect(parsed.format).toBeNull();
    expect(parsed.error).toContain("YAML account config must be an object");
  });
});
