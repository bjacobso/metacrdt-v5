import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseFormaAccountConfigSource } from "@metacrdt/account-config";
import staffingFormaSource from "../configs/accounts/staffing.forma?raw";
import legalFormaSource from "../configs/accounts/legal-workflows.forma?raw";
import {
  AccountConfigCompletionPanel,
  AccountConfigApplyJobsPanel,
  AccountConfigDraftReviewPanel,
  AccountConfigDriftPanel,
  AccountConfigHistoryPanel,
  AccountConfigPlanPanel,
  AccountConfigResourceGraphPanel,
  AccountConfigSourceDiagnosticsPanel,
  AccountConfigSourceDiffPanel,
  AccountConfigSavedDraftSelector,
  AccountConfigCheckedInSourceSelector,
  AccountConfigWorkflowPanel,
  AccountDeploymentPanel,
} from "./accountConfigView";
import {
  AccountConfigSourceEditor,
  accountConfigFormaIntelligence,
} from "./AccountConfigSourceEditor";
import {
  accountConfigResourceGraph,
  accountConfigResourceGraphToMermaid,
  formaCompletionSuggestions,
  parseAccountConfigSource,
} from "./configSource";
import { TenantSelector } from "./TenantSelector";

const EMPTY_DIFF = {
  added: [],
  changed: [],
  removed: [],
  unchanged: [],
};

function graphReviewForForma(source: string) {
  const parsed = parseFormaAccountConfigSource(source);
  expect(parsed.diagnostics).toEqual([]);
  if (parsed.config === null) throw new Error("expected checked-in Forma to parse");
  const config = parsed.config as { account?: { slug?: string; name?: string } };
  const edges = accountConfigResourceGraph(parsed.config);
  const mermaid = accountConfigResourceGraphToMermaid(edges, {
    account: config.account,
  });
  const html = renderToStaticMarkup(
    <AccountConfigResourceGraphPanel edges={edges} mermaid={mermaid} expanded />,
  );
  return { edges, html, mermaid };
}

describe("tenant and account config rendering", () => {
  it("renders the account config source editor with line gutter", () => {
    const html = renderToStaticMarkup(
      <AccountConfigSourceEditor
        value={'(tenant (slug "legal-workflows"))\n(entity Matter)'}
        onChange={() => undefined}
      />,
    );

    expect(html).toContain("<textarea");
    expect(html).toContain("legal-workflows");
    expect(html).toContain(">1</div>");
    expect(html).toContain(">2</div>");
  });

  it("renders the plain account config source editor as read-only", () => {
    const html = renderToStaticMarkup(
      <AccountConfigSourceEditor
        value='{"account":{"slug":"legal-workflows"}}'
        readOnly
        onChange={() => undefined}
      />,
    );

    expect(html).toContain("<textarea");
    expect(html).toContain("readOnly");
  });

  it("renders the Forma source editor shell", () => {
    const html = renderToStaticMarkup(
      <AccountConfigSourceEditor
        format="forma"
        value={'(tenant (slug "legal-workflows"))\n(entity Matter)'}
        onChange={() => undefined}
      />,
    );

    expect(html).toContain('data-account-config-editor="forma"');
    expect(html).toContain("Forma account config source");
  });

  it("provides resource-aware Forma editor hover details", () => {
    const source = `(tenant legal-workflows "Legal Workflows" legal)
(attr "matter.status" string)
(entity Matter ["matter.status"])
(form conflict_check "Conflict Check"
  (field cleared boolean "Cleared"))
(flow matter_intake Matter "Matter intake" "Open a matter." collect
  (collect collect conflict_check client (next done))
  (done))
(action close_matter Matter "Close matter" "Closes a matter."
  (assert "matter.status" closed))`;
    const intelligence = accountConfigFormaIntelligence();
    const hover = (token: string) =>
      intelligence.hover?.getHover(source, source.indexOf(token) + 1)?.content;

    expect(hover("matter.status")).toBe("Attribute matter.status: string, one");
    expect(hover("conflict_check")).toBe("Form conflict_check: 1 fields - Conflict Check");
    expect(hover("matter_intake")).toBe("Flow matter_intake for Matter: 2 steps");
    expect(hover("close_matter")).toBe("Action close_matter for Matter: 1 assertions");
  });

  it("renders source-aware completion details and generated Forma preview", () => {
    const html = renderToStaticMarkup(
      <AccountConfigCompletionPanel
        suggestions={[
          {
            label: "Field for matter.status",
            detail: "Add a form/action field sourced from matter.status",
            source: '(field "matter.status" string "Matter Status")\n',
            sourceAware: true,
          },
        ]}
        selectedIndex={0}
        onSelectedIndexChange={() => undefined}
        onInsert={() => undefined}
      />,
    );

    expect(html).toContain("Field for matter.status");
    expect(html).toContain("source-aware");
    expect(html).toContain("Add a form/action field sourced from matter.status");
    expect(html).toContain("(field &quot;matter.status&quot; string &quot;Matter Status&quot;)");
    expect(html).toContain("Insert snippet");
  });

  it("renders grouped Forma template completions", () => {
    const parsed = parseAccountConfigSource(
      '(tenant grouped-demo "Grouped Demo" custom)',
    );
    expect(parsed.error).toBeNull();
    const suggestions = formaCompletionSuggestions(parsed.config);
    const selectedIndex = suggestions.findIndex(
      (suggestion) => suggestion.label === "New grouped bundle",
    );
    expect(selectedIndex).toBeGreaterThanOrEqual(0);

    const html = renderToStaticMarkup(
      <AccountConfigCompletionPanel
        suggestions={suggestions}
        selectedIndex={selectedIndex}
        onSelectedIndexChange={() => undefined}
        onInsert={() => undefined}
      />,
    );

    expect(html).toContain("New grouped bundle");
    expect(html).toContain("template");
    expect(html).toContain("Account bundle with plural grouping wrappers");
    expect(html).toContain("(account-config");
    expect(html).toContain("(attributes");
    expect(html).toContain("(steps");
  });

  it("renders terminal done-step completion snippets from parsed Forma source", () => {
    const parsed = parseAccountConfigSource(`(tenant done-demo "Done Demo" custom)
(attr client entityRef)
(entity Case [client])
(flow case_review Case "Case review" "Reviews a case." start
  (notify start "Started" email "$arg.client" "started"))`);
    expect(parsed.error).toBeNull();
    const suggestions = formaCompletionSuggestions(parsed.config);
    const selectedIndex = suggestions.findIndex(
      (suggestion) => suggestion.label === "Done step",
    );
    expect(selectedIndex).toBeGreaterThanOrEqual(0);

    const html = renderToStaticMarkup(
      <AccountConfigCompletionPanel
        suggestions={suggestions}
        selectedIndex={selectedIndex}
        onSelectedIndexChange={() => undefined}
        onInsert={() => undefined}
      />,
    );

    expect(html).toContain("Done step");
    expect(html).toContain("Terminal workflow step for compact flow authoring.");
    expect(html).toContain("source-aware");
    expect(html).toContain("(done)");
  });

  it("renders required select field completion snippets from parsed Forma source", () => {
    const parsed = parseAccountConfigSource(`(tenant required-demo "Required Demo" custom)
(attr client entityRef)
(attr "matter.status" string)
(attr "i9/citizenship" string)
(attr "everify.status" string)
(entity Matter [client "matter.status" "i9/citizenship" "everify.status"])`);
    expect(parsed.error).toBeNull();
    const suggestions = formaCompletionSuggestions(parsed.config);
    const selectedIndex = suggestions.findIndex(
      (suggestion) => suggestion.label === "Required select field for matter.status",
    );
    expect(selectedIndex).toBeGreaterThanOrEqual(0);

    const html = renderToStaticMarkup(
      <AccountConfigCompletionPanel
        suggestions={suggestions}
        selectedIndex={selectedIndex}
        onSelectedIndexChange={() => undefined}
        onInsert={() => undefined}
      />,
    );

    expect(html).toContain("Required select field for matter.status");
    expect(html).toContain("Nested required select field with reviewable options");
    expect(html).toContain(
      "(field &quot;matter.status&quot; select &quot;Matter Status&quot; [&quot;open&quot; &quot;closed&quot;] (required))",
    );

    const citizenshipIndex = suggestions.findIndex(
      (suggestion) => suggestion.label === "Required select field for i9/citizenship",
    );
    expect(citizenshipIndex).toBeGreaterThanOrEqual(0);
    const citizenshipHtml = renderToStaticMarkup(
      <AccountConfigCompletionPanel
        suggestions={suggestions}
        selectedIndex={citizenshipIndex}
        onSelectedIndexChange={() => undefined}
        onInsert={() => undefined}
      />,
    );

    expect(citizenshipHtml).toContain("Required select field for i9/citizenship");
    expect(citizenshipHtml).toContain(
      "(field &quot;i9/citizenship&quot; select &quot;I-9 Citizenship&quot; [&quot;citizen&quot; &quot;permanent_resident&quot; &quot;authorized_alien&quot;] (required))",
    );

    const everifyIndex = suggestions.findIndex(
      (suggestion) => suggestion.label === "Default select field for everify.status",
    );
    expect(everifyIndex).toBeGreaterThanOrEqual(0);
    const everifyHtml = renderToStaticMarkup(
      <AccountConfigCompletionPanel
        suggestions={suggestions}
        selectedIndex={everifyIndex}
        onSelectedIndexChange={() => undefined}
        onInsert={() => undefined}
      />,
    );

    expect(everifyHtml).toContain("Default select field for everify.status");
    expect(everifyHtml).toContain(
      "(field &quot;everify.status&quot; select &quot;E-Verify Status&quot; [&quot;pending&quot; &quot;verified&quot; &quot;needs_review&quot;] (default-value &quot;pending&quot;))",
    );
  });

  it("renders PII field completion snippets from parsed Forma source", () => {
    const parsed = parseAccountConfigSource(`(tenant pii-demo "PII Demo" custom)
(attr client entityRef)
(attr ssn string)
(entity Worker [client ssn])`);
    expect(parsed.error).toBeNull();
    const suggestions = formaCompletionSuggestions(parsed.config);
    const selectedIndex = suggestions.findIndex(
      (suggestion) => suggestion.label === "Required PII string field for ssn",
    );
    expect(selectedIndex).toBeGreaterThanOrEqual(0);

    const html = renderToStaticMarkup(
      <AccountConfigCompletionPanel
        suggestions={suggestions}
        selectedIndex={selectedIndex}
        onSelectedIndexChange={() => undefined}
        onInsert={() => undefined}
      />,
    );

    expect(html).toContain("Required PII string field for ssn");
    expect(html).toContain("Nested required string form field marked as PII");
    expect(html).toContain("(field &quot;ssn&quot; string &quot;SSN&quot; (required) (pii))");

    const formIndex = suggestions.findIndex(
      (suggestion) => suggestion.label === "Form for Worker",
    );
    expect(formIndex).toBeGreaterThanOrEqual(0);
    const formHtml = renderToStaticMarkup(
      <AccountConfigCompletionPanel
        suggestions={suggestions}
        selectedIndex={formIndex}
        onSelectedIndexChange={() => undefined}
        onInsert={() => undefined}
      />,
    );

    expect(formHtml).toContain("Form for Worker");
    expect(formHtml).toContain("(field &quot;ssn&quot; string &quot;SSN&quot; (pii))");
  });

  it("renders typed literal completion snippets from parsed Forma source", () => {
    const parsed = parseAccountConfigSource(`(tenant typed-demo "Typed Demo" custom)
(attr client entityRef)
(attr approved boolean)
(entity Case [client approved])
(form approval_review "Approval Review"
  (field approved boolean "Approved"))
`);
    expect(parsed.error).toBeNull();
    const suggestions = formaCompletionSuggestions(parsed.config);
    const selectedIndex = suggestions.findIndex(
      (suggestion) => suggestion.label === "Branch on approved step",
    );
    expect(selectedIndex).toBeGreaterThanOrEqual(0);

    const html = renderToStaticMarkup(
      <AccountConfigCompletionPanel
        suggestions={suggestions}
        selectedIndex={selectedIndex}
        onSelectedIndexChange={() => undefined}
        onInsert={() => undefined}
      />,
    );

    expect(html).toContain("Branch on approved step");
    expect(html).toContain("source-aware");
    expect(html).toContain(
      "(branch route_approved [[&quot;?s&quot; &quot;approved&quot; true]] set_approved done)",
    );
    expect(html).toContain(
      "(action set_approved &quot;Set approved&quot; &quot;approved&quot; true (next done))",
    );
  });

  it("renders defaulted typed field completion snippets from parsed Forma source", () => {
    const parsed = parseAccountConfigSource(`(tenant typed-demo "Typed Demo" custom)
(attr client entityRef)
(attr "risk.score" number)
(attr "review.date" date)
(entity Case [client "risk.score" "review.date"])
`);
    expect(parsed.error).toBeNull();
    const suggestions = formaCompletionSuggestions(parsed.config);
    const selectedIndex = suggestions.findIndex(
      (suggestion) => suggestion.label === "Default number field for risk.score",
    );
    expect(selectedIndex).toBeGreaterThanOrEqual(0);

    const html = renderToStaticMarkup(
      <AccountConfigCompletionPanel
        suggestions={suggestions}
        selectedIndex={selectedIndex}
        onSelectedIndexChange={() => undefined}
        onInsert={() => undefined}
      />,
    );

    expect(html).toContain("Default number field for risk.score");
    expect(html).toContain("source-aware");
    expect(html).toContain(
      "(field &quot;risk.score&quot; number &quot;Risk Score&quot; (default-value 1))",
    );

    const dateIndex = suggestions.findIndex(
      (suggestion) => suggestion.label === "Default date field for review.date",
    );
    expect(dateIndex).toBeGreaterThanOrEqual(0);
    const dateHtml = renderToStaticMarkup(
      <AccountConfigCompletionPanel
        suggestions={suggestions}
        selectedIndex={dateIndex}
        onSelectedIndexChange={() => undefined}
        onInsert={() => undefined}
      />,
    );

    expect(dateHtml).toContain("Default date field for review.date");
    expect(dateHtml).toContain(
      "(field &quot;review.date&quot; date &quot;Review Date&quot; (default-value &quot;2026-01-01&quot;))",
    );
  });

  it("renders secondary scope completion snippets from parsed Forma source", () => {
    const parsed = parseAccountConfigSource(`${legalFormaSource}
(form risk_review "Risk Review"
  (field cleared boolean "Risk cleared" (required)))
`);
    expect(parsed.error).toBeNull();
    const suggestions = formaCompletionSuggestions(parsed.config);
    const selectedIndex = suggestions.findIndex(
      (suggestion) =>
        suggestion.label === "Requirement for risk_review scoped to responsible.attorney",
    );
    expect(selectedIndex).toBeGreaterThanOrEqual(0);

    const html = renderToStaticMarkup(
      <AccountConfigCompletionPanel
        suggestions={suggestions}
        selectedIndex={selectedIndex}
        onSelectedIndexChange={() => undefined}
        onInsert={() => undefined}
      />,
    );

    expect(html).toContain("Requirement for risk_review scoped to responsible.attorney");
    expect(html).toContain("source-aware");
    expect(html).toContain(
      "(requires &quot;risk_review&quot; &quot;responsible.attorney&quot;)",
    );
  });

  it("renders secondary scoped collect snippets with distinct step ids", () => {
    const parsed = parseAccountConfigSource(legalFormaSource);
    expect(parsed.error).toBeNull();
    const suggestions = formaCompletionSuggestions(parsed.config);
    const selectedIndex = suggestions.findIndex(
      (suggestion) =>
        suggestion.label === "Collect conflict_check step scoped to responsible.attorney",
    );
    expect(selectedIndex).toBeGreaterThanOrEqual(0);

    const html = renderToStaticMarkup(
      <AccountConfigCompletionPanel
        suggestions={suggestions}
        selectedIndex={selectedIndex}
        onSelectedIndexChange={() => undefined}
        onInsert={() => undefined}
      />,
    );

    expect(html).toContain("Collect conflict_check step scoped to responsible.attorney");
    expect(html).toContain("collect_conflict_check_responsible_attorney");
    expect(html).toContain(
      "(collect &quot;conflict_check&quot; &quot;responsible.attorney&quot;)",
    );
  });

  it("renders scoped generated flow completion snippets", () => {
    const parsed = parseAccountConfigSource(legalFormaSource);
    expect(parsed.error).toBeNull();
    const suggestions = formaCompletionSuggestions(parsed.config);
    const selectedIndex = suggestions.findIndex(
      (suggestion) =>
        suggestion.label ===
          "Flow for Matter collecting conflict_check scoped to responsible.attorney",
    );
    expect(selectedIndex).toBeGreaterThanOrEqual(0);

    const html = renderToStaticMarkup(
      <AccountConfigCompletionPanel
        suggestions={suggestions}
        selectedIndex={selectedIndex}
        onSelectedIndexChange={() => undefined}
        onInsert={() => undefined}
      />,
    );

    expect(html).toContain(
      "Flow for Matter collecting conflict_check scoped to responsible.attorney",
    );
    expect(html).toContain("collect_conflict_check_responsible_attorney");
    expect(html).toContain(
      '(collect &quot;conflict_check&quot; &quot;responsible.attorney&quot;)',
    );
  });

  it("renders scoped open-form action completion snippets", () => {
    const parsed = parseAccountConfigSource(legalFormaSource);
    expect(parsed.error).toBeNull();
    const suggestions = formaCompletionSuggestions(parsed.config);
    const selectedIndex = suggestions.findIndex(
      (suggestion) =>
        suggestion.label ===
          "Open conflict_check action for Matter scoped to responsible.attorney",
    );
    expect(selectedIndex).toBeGreaterThanOrEqual(0);

    const html = renderToStaticMarkup(
      <AccountConfigCompletionPanel
        suggestions={suggestions}
        selectedIndex={selectedIndex}
        onSelectedIndexChange={() => undefined}
        onInsert={() => undefined}
      />,
    );

    expect(html).toContain(
      "Open conflict_check action for Matter scoped to responsible.attorney",
    );
    expect(html).toContain("source-aware");
    expect(html).toContain(
      '(opens-form &quot;conflict_check&quot; &quot;responsible.attorney&quot;)',
    );
  });

  it("renders generated entity review form snippets with scoped requirements", () => {
    const parsed = parseAccountConfigSource(legalFormaSource);
    expect(parsed.error).toBeNull();
    const suggestions = formaCompletionSuggestions(parsed.config);
    const selectedIndex = suggestions.findIndex(
      (suggestion) => suggestion.label === "Form for Matter",
    );
    expect(selectedIndex).toBeGreaterThanOrEqual(0);

    const html = renderToStaticMarkup(
      <AccountConfigCompletionPanel
        suggestions={suggestions}
        selectedIndex={selectedIndex}
        onSelectedIndexChange={() => undefined}
        onInsert={() => undefined}
      />,
    );

    expect(html).toContain("Form for Matter");
    expect(html).toContain("Drafts a Matter review form scoped by client.");
    expect(html).toContain(
      '(field &quot;matter.status&quot; select &quot;Matter Status&quot;',
    );
    expect(html).toContain(
      '(requires &quot;client&quot; &quot;Requires Matter review evidence for each Client scope.&quot;)',
    );
  });

  it("renders generated action completion snippets with asserted values in labels", () => {
    const parsed = parseAccountConfigSource(legalFormaSource);
    expect(parsed.error).toBeNull();
    const suggestions = formaCompletionSuggestions(parsed.config);
    const selectedIndex = suggestions.findIndex(
      (suggestion) =>
        suggestion.label === "Action on Matter setting matter.status=open",
    );
    expect(selectedIndex).toBeGreaterThanOrEqual(0);

    const html = renderToStaticMarkup(
      <AccountConfigCompletionPanel
        suggestions={suggestions}
        selectedIndex={selectedIndex}
        onSelectedIndexChange={() => undefined}
        onInsert={() => undefined}
      />,
    );

    expect(html).toContain("Action on Matter setting matter.status=open");
    expect(html).toContain("source-aware");
    expect(html).toContain('(assert &quot;matter.status&quot; &quot;open&quot;)');
  });

  it("renders E-Verify completion assertions separately from pending field defaults", () => {
    const parsed = parseAccountConfigSource(`(tenant everify-demo "E-Verify Demo" staffing)
(attr employer entityRef)
(attr "everify.status" string)
(entity Worker [employer "everify.status"])
(form everify_review "E-Verify Review"
  (field "everify.status" select "E-Verify Status" ["pending" "verified" "needs_review"] (default-value "pending")))`);
    expect(parsed.error).toBeNull();
    const suggestions = formaCompletionSuggestions(parsed.config);
    const selectedIndex = suggestions.findIndex(
      (suggestion) =>
        suggestion.label === "Action on Worker setting everify.status=verified",
    );
    expect(selectedIndex).toBeGreaterThanOrEqual(0);

    const html = renderToStaticMarkup(
      <AccountConfigCompletionPanel
        suggestions={suggestions}
        selectedIndex={selectedIndex}
        onSelectedIndexChange={() => undefined}
        onInsert={() => undefined}
      />,
    );

    expect(html).toContain("Action on Worker setting everify.status=verified");
    expect(html).toContain('(assert &quot;everify.status&quot; &quot;verified&quot;)');
    expect(
      suggestions.find(
        (suggestion) => suggestion.label === "Default select field for everify.status",
      )?.source,
    ).toContain('(default-value "pending")');
  });

  it("renders compact delay completion snippets from parsed Forma source", () => {
    const parsed = parseAccountConfigSource(`(tenant delay-demo "Delay Demo" custom)
(attr client entityRef)
(entity Case [client])
(flow review Case "Review" "Review flow" done
  (done))
`);
    expect(parsed.error).toBeNull();
    const suggestions = formaCompletionSuggestions(parsed.config);
    const selectedIndex = suggestions.findIndex(
      (suggestion) => suggestion.label === "Delay review step",
    );
    expect(selectedIndex).toBeGreaterThanOrEqual(0);

    const html = renderToStaticMarkup(
      <AccountConfigCompletionPanel
        suggestions={suggestions}
        selectedIndex={selectedIndex}
        onSelectedIndexChange={() => undefined}
        onInsert={() => undefined}
      />,
    );

    expect(html).toContain("Delay review step");
    expect(html).toContain("source-aware");
    expect(html).toContain("Pauses a workflow before continuing to done.");
    expect(html).toContain("(delay delay_review 300 (next done))");
  });

  it("renders source diagnostics with duplicate line hints and jump affordances", () => {
    const html = renderToStaticMarkup(
      <AccountConfigSourceDiagnosticsPanel
        diagnostics={[
          {
            message:
              "duplicate attribute: matter.status (first defined on line 2, duplicate on line 3)",
            path: "attribute:matter.status",
            loc: { line: 3, col: 1 },
          },
          {
            message: "requirement references unknown form conflict_check",
            path: "requirement:conflict_check",
            loc: { line: 8, col: 3 },
          },
        ]}
        onFocusLine={() => undefined}
      />,
    );

    expect(html).toContain("Source diagnostics");
    expect(html).toContain("Source diagnostics (2)");
    expect(html).toContain("attribute:matter.status line 3, col 1");
    expect(html).toContain("first defined on line 2, duplicate on line 3");
    expect(html).toContain("requirement:conflict_check line 8, col 3");
    expect(html).toContain("requirement references unknown form conflict_check");
    expect(html).toContain("Go");
  });

  it("renders parser repair hints for typoed Forma heads", () => {
    const groupedParsed = parseFormaAccountConfigSource(`
(tenant legal-workflows "Legal Workflows" legal)
(account-config
  (forms
    (fom intake "Intake")))
`);
    const topLevelParsed = parseFormaAccountConfigSource(`
(requiremnt intake client)
`);

    expect(groupedParsed.config).toBeNull();
    expect(topLevelParsed.config).toBeNull();
    const html = renderToStaticMarkup(
      <AccountConfigSourceDiagnosticsPanel
        diagnostics={[
          ...groupedParsed.diagnostics,
          ...topLevelParsed.diagnostics,
        ]}
        onFocusLine={() => undefined}
      />,
    );

    expect(html).toContain("Source diagnostics (2)");
    expect(html).toContain("line 5, col 5");
    expect(html).toContain("forms wrapper can only contain form resources");
    expect(html).toContain("Did you mean form?");
    expect(html).toContain("line 2, col 1");
    expect(html).toContain("unknown account config form: requiremnt");
    expect(html).toContain("Did you mean requirement?");
    expect(html.match(/Go/g)?.length).toBe(2);
  });

  it("renders duplicate singleton metadata diagnostics from parsed Forma source", () => {
    const parsed = parseFormaAccountConfigSource(`
(tenant legal-workflows "Legal Workflows" legal)
(form intake "Intake"
  (title "First")
  (title "Second")
  (field ready boolean "Ready"
    (label "Ready?")
    (label "Ready again")))
`);

    expect(parsed.config).not.toBeNull();
    expect(parsed.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "form intake has multiple title entries; only the first is used",
          loc: expect.objectContaining({ line: 5, col: 3 }),
        }),
        expect.objectContaining({
          message:
            "form intake field ready has multiple label entries; only the first is used",
          loc: expect.objectContaining({ line: 8, col: 5 }),
        }),
      ]),
    );

    const html = renderToStaticMarkup(
      <AccountConfigSourceDiagnosticsPanel
        diagnostics={parsed.diagnostics}
        onFocusLine={() => undefined}
      />,
    );

    expect(html).toContain("Source diagnostics (2)");
    expect(html).toContain("line 5, col 3");
    expect(html).toContain("form intake has multiple title entries");
    expect(html).toContain("line 8, col 5");
    expect(html).toContain("form intake field ready has multiple label entries");
    expect(html.match(/Go/g)?.length).toBe(2);
  });

  it("renders typed literal diagnostics with source paths and counts", () => {
    const html = renderToStaticMarkup(
      <AccountConfigSourceDiagnosticsPanel
        diagnostics={[
          {
            message: "requirement conflict_check guard value for approved must be a boolean",
            path: "requirement:conflict_check",
            loc: { line: 9, col: 3 },
          },
          {
            message: "flow review step route where clause 1 value for risk.score must be a number",
            path: "flowStep:review:route",
            loc: { line: 11, col: 3 },
          },
          {
            message: "action close assert value for client must be a string",
            path: "action:close",
            loc: { line: 15, col: 1 },
          },
        ]}
        onFocusLine={() => undefined}
      />,
    );

    expect(html).toContain("Source diagnostics (3)");
    expect(html).toContain("requirement:conflict_check line 9, col 3");
    expect(html).toContain("guard value for approved must be a boolean");
    expect(html).toContain("flowStep:review:route line 11, col 3");
    expect(html).toContain("where clause 1 value for risk.score must be a number");
    expect(html).toContain("action:close line 15, col 1");
    expect(html).toContain("assert value for client must be a string");
    expect(html.match(/Go/g)?.length).toBe(3);
  });

  it("renders field default diagnostics from parsed Forma source", () => {
    const parsed = parseFormaAccountConfigSource(`
(tenant default-demo "Default Demo" custom)
(attr "case.status" string)
(entity Case ["case.status"])
(form intake "Intake"
  (field "bad_number_default" number "Bad number" (default "high"))
  (field "bad_select_default" select "Bad select" ["open" "closed"] (default "missing"))
  (field "bad_date_default" date "Bad date" (default false)))
(action close Case "Close"
  (field "bad_action_boolean" boolean "Bad action boolean" (default "true"))
  (assert "case.status" "closed"))
`);

    expect(parsed.config).not.toBeNull();
    expect(parsed.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "form intake field bad_number_default defaultValue must be a number",
          loc: expect.objectContaining({ line: 6 }),
        }),
        expect.objectContaining({
          message:
            "form intake field bad_select_default defaultValue must be one of its options",
          loc: expect.objectContaining({ line: 7 }),
        }),
        expect.objectContaining({
          message: "form intake field bad_date_default defaultValue must be a string",
          loc: expect.objectContaining({ line: 8 }),
        }),
        expect.objectContaining({
          message:
            "action close field bad_action_boolean defaultValue must be a boolean",
          loc: expect.objectContaining({ line: 10 }),
        }),
      ]),
    );

    const html = renderToStaticMarkup(
      <AccountConfigSourceDiagnosticsPanel
        diagnostics={parsed.diagnostics}
        onFocusLine={() => undefined}
      />,
    );

    expect(html).toContain("Source diagnostics (4)");
    expect(html).toContain("line 6");
    expect(html).toContain("bad_number_default defaultValue must be a number");
    expect(html).toContain("line 7");
    expect(html).toContain("bad_select_default defaultValue must be one of its options");
    expect(html).toContain("line 8");
    expect(html).toContain("bad_date_default defaultValue must be a string");
    expect(html).toContain("line 10");
    expect(html).toContain("bad_action_boolean defaultValue must be a boolean");
    expect(html.match(/Go/g)?.length).toBe(4);
  });

  it("renders tenant switcher options and selected value", () => {
    const html = renderToStaticMarkup(
      <TenantSelector
        tenants={[
          { slug: "acme-staffing", name: "Acme Staffing" },
          { slug: "legal-workflows", name: "Legal Workflows" },
        ]}
        selectedTenantSlug="legal-workflows"
        isAuthenticated
        onSelect={() => undefined}
        onCreateDemoTenant={() => undefined}
        onCreateDemoTenants={() => undefined}
      />,
    );

    expect(html).toContain("Tenant");
    expect(html).toContain('value="acme-staffing"');
    expect(html).toContain("Acme Staffing");
    expect(html).toContain('value="legal-workflows"');
    expect(html).toContain("Legal Workflows");
  });

  it("renders demo tenant creation disabled for anonymous users", () => {
    const html = renderToStaticMarkup(
      <TenantSelector
        tenants={[]}
        selectedTenantSlug={null}
        isAuthenticated={false}
        onSelect={() => undefined}
        onCreateDemoTenant={() => undefined}
        onCreateDemoTenants={() => undefined}
      />,
    );

    expect(html).toContain("Create staffing tenant");
    expect(html).toContain("Create legal tenant");
    expect(html).toContain("Create both demo tenants");
    expect(html).toContain("disabled");
  });

  it("renders plan changes, validation errors, and dangerous changes", () => {
    const html = renderToStaticMarkup(
      <AccountConfigPlanPanel
        plan={{
          valid: false,
          errors: ["entityType Matter references unknown attribute missing.attr"],
          byKind: {
            attribute: {
              ...EMPTY_DIFF,
              added: ["matter.status"],
            },
            entityType: {
              ...EMPTY_DIFF,
              changed: ["Matter"],
            },
            form: EMPTY_DIFF,
            flow: EMPTY_DIFF,
            requirement: {
              ...EMPTY_DIFF,
              removed: ["forklift"],
            },
            action: EMPTY_DIFF,
          },
          dangerous: [
            {
              kind: "requirement",
              value: "forklift",
              reason: "Removing a requirement can close derived obligations.",
            },
          ],
        }}
      />,
    );

    expect(html).toContain("Config has errors");
    expect(html).toContain("missing.attr");
    expect(html).toContain("+ matter.status");
    expect(html).toContain("~ Matter");
    expect(html).toContain("- forklift");
    expect(html).toContain("Dangerous changes");
    expect(html).toContain("requirement:forklift");
  });

  it("renders metadata-only account config plans as reviewable changes", () => {
    const html = renderToStaticMarkup(
      <AccountConfigPlanPanel
        plan={{
          valid: true,
          errors: [],
          accountChange: {
            action: "changed",
            before: {
              slug: "legal-workflows",
              name: "Legal Workflows",
              kind: "legal",
            },
            after: {
              slug: "legal-workflows",
              name: "Legal Operations",
              kind: "custom",
            },
            changedFields: ["name", "kind"],
          },
          byKind: {
            attribute: EMPTY_DIFF,
            entityType: EMPTY_DIFF,
            form: EMPTY_DIFF,
            flow: EMPTY_DIFF,
            requirement: EMPTY_DIFF,
            action: EMPTY_DIFF,
          },
          dangerous: [],
        }}
      />,
    );

    expect(html).toContain("Valid config shape");
    expect(html).toContain("account name, kind changed");
    expect(html).toContain("Legal Workflows");
    expect(html).toContain("Legal Operations");
    expect(html).toContain("name");
    expect(html).toContain("kind");
    expect(html).toContain("no changes");
    expect(html).not.toContain("Dangerous changes");
  });

  it("renders failed apply jobs with retry affordance", () => {
    const html = renderToStaticMarkup(
      <AccountConfigApplyJobsPanel
        applyJobs={[
          {
            _id: "job1",
            status: "failed",
            attempts: 2,
            updatedAt: 1_700_000_000_000,
            error: "invalid account config",
          },
        ]}
        busy={false}
        onRetry={() => undefined}
      />,
    );

    expect(html).toContain("Apply Jobs");
    expect(html).toContain("failed");
    expect(html).toContain("attempt 2");
    expect(html).toContain("invalid account config");
    expect(html).toContain("Retry");
  });

  it("renders saved draft source review metadata before deployment planning", () => {
    const html = renderToStaticMarkup(
      <AccountConfigDraftReviewPanel
        notice="Loaded main"
        draft={{
          sourceDigest: "cyrb53:draft-source",
          checkedInPath: "configs/accounts/legal-workflows.forma",
          checkedInDigest: "cyrb53:checked-in",
          reviewNote: "Conflict workflow source review",
          validation: {
            valid: false,
            errors: ["unknown form conflict_chek", "unknown attribute matter.staus"],
          },
        }}
      />,
    );

    expect(html).toContain("Loaded main");
    expect(html).toContain("2 issues");
    expect(html).toContain("checked-in differs");
    expect(html).toContain("configs/accounts/legal-workflows.forma");
    expect(html).toContain("cyrb53:draft-source");
    expect(html).toContain("Conflict workflow source review");

    const matchingHtml = renderToStaticMarkup(
      <AccountConfigDraftReviewPanel
        draft={{
          sourceDigest: "cyrb53:checked-in",
          checkedInPath: "configs/accounts/legal-workflows.forma",
          checkedInDigest: "cyrb53:checked-in",
          validation: { valid: true, errors: [] },
        }}
      />,
    );

    expect(matchingHtml).toContain("valid");
    expect(matchingHtml).toContain("checked-in matches");
  });

  it("renders saved draft selection states for deployment review", () => {
    const loadingHtml = renderToStaticMarkup(
      <AccountConfigSavedDraftSelector
        drafts={undefined}
        selectedDraftId=""
        busy={false}
        onSelectDraft={() => undefined}
        onLoadDraft={() => undefined}
        onDeleteDraft={() => undefined}
      />,
    );

    expect(loadingHtml).toContain("Loading saved drafts");
    expect(loadingHtml).toContain("disabled");
    expect(loadingHtml).toContain("Load");
    expect(loadingHtml).toContain("Delete");

    const emptyHtml = renderToStaticMarkup(
      <AccountConfigSavedDraftSelector
        drafts={[]}
        selectedDraftId=""
        busy={false}
        onSelectDraft={() => undefined}
        onLoadDraft={() => undefined}
        onDeleteDraft={() => undefined}
      />,
    );

    expect(emptyHtml).toContain("No saved drafts");
    expect(emptyHtml).toContain("0 saved");
    expect(emptyHtml).toContain("disabled");

    const selectedHtml = renderToStaticMarkup(
      <AccountConfigSavedDraftSelector
        drafts={[
          {
            _id: "draft-main",
            name: "main",
            sourceFormat: "forma",
            updatedAt: 1_700_000_000_000,
          },
          {
            _id: "draft-legal",
            name: "legal-review",
            sourceFormat: "yaml",
            updatedAt: 1_700_000_100_000,
          },
        ]}
        selectedDraftId="draft-legal"
        busy={false}
        onSelectDraft={() => undefined}
        onLoadDraft={() => undefined}
        onDeleteDraft={() => undefined}
      />,
    );

    expect(selectedHtml).toContain("2 saved");
    expect(selectedHtml).toContain("main - FORMA");
    expect(selectedHtml).toContain("legal-review - YAML");
    expect(selectedHtml).toContain('value="draft-legal" selected');
    expect(selectedHtml).toContain("Load");
    expect(selectedHtml).toContain("Delete");

    const busyHtml = renderToStaticMarkup(
      <AccountConfigSavedDraftSelector
        drafts={[
          {
            _id: "draft-main",
            name: "main",
            sourceFormat: "forma",
            updatedAt: 1_700_000_000_000,
          },
        ]}
        selectedDraftId="draft-main"
        busy
        onSelectDraft={() => undefined}
        onLoadDraft={() => undefined}
        onDeleteDraft={() => undefined}
      />,
    );

    expect(busyHtml).toContain("Load");
    expect(busyHtml).toContain("Delete");
    expect(busyHtml).toContain("disabled");
  });

  it("renders checked-in source selection and comparison states", () => {
    const emptyHtml = renderToStaticMarkup(
      <AccountConfigCheckedInSourceSelector
        sources={[]}
        selectedPath=""
        draftOpen={false}
        draftMatchesSelected={false}
        onSelectSource={() => undefined}
        onLoadSource={() => undefined}
      />,
    );

    expect(emptyHtml).toContain("No checked-in source for tenant");
    expect(emptyHtml).toContain("Load source");
    expect(emptyHtml).toContain("disabled");
    expect(emptyHtml).not.toContain("matches");
    expect(emptyHtml).not.toContain("differs");

    const matchingHtml = renderToStaticMarkup(
      <AccountConfigCheckedInSourceSelector
        sources={[
          {
            path: "configs/accounts/legal-workflows.forma",
            label: "Legal Forma",
          },
        ]}
        selectedPath="configs/accounts/legal-workflows.forma"
        draftOpen
        draftMatchesSelected
        onSelectSource={() => undefined}
        onLoadSource={() => undefined}
      />,
    );

    expect(matchingHtml).toContain("Legal Forma");
    expect(matchingHtml).toContain("configs/accounts/legal-workflows.forma");
    expect(matchingHtml).toContain("matches");
    expect(matchingHtml).not.toContain("differs");

    const differingHtml = renderToStaticMarkup(
      <AccountConfigCheckedInSourceSelector
        sources={[
          {
            path: "configs/accounts/legal-workflows.forma",
            label: "Legal Forma",
          },
        ]}
        selectedPath="configs/accounts/legal-workflows.forma"
        draftOpen
        draftMatchesSelected={false}
        onSelectSource={() => undefined}
        onLoadSource={() => undefined}
      />,
    );

    expect(differingHtml).toContain("differs");

    const staleSelectionHtml = renderToStaticMarkup(
      <AccountConfigCheckedInSourceSelector
        sources={[
          {
            path: "configs/accounts/legal-workflows.forma",
            label: "Legal Forma",
          },
        ]}
        selectedPath="configs/accounts/staffing.forma"
        draftOpen={false}
        draftMatchesSelected={false}
        onSelectSource={() => undefined}
        onLoadSource={() => undefined}
      />,
    );

    expect(staleSelectionHtml).toContain(
      'value="configs/accounts/legal-workflows.forma" selected',
    );
    expect(staleSelectionHtml).toContain("differs");
  });

  it("renders account config drift between draft, live, and active deployment", () => {
    const snapshot = {
      sourceDigest: "cyrb53:source",
      artifactDigest: "cyrb53:artifact",
      manifest: {
        attributes: ["matter.status"],
        entityTypes: ["Matter"],
        forms: ["conflict_check"],
      },
      diagnostics: [],
    };
    const html = renderToStaticMarkup(
      <AccountConfigDriftPanel
        draft={snapshot}
        live={{
          ...snapshot,
          sourceDigest: "cyrb53:live-source",
          artifactDigest: "cyrb53:live-artifact",
        }}
        active={{
          artifactDigest: "cyrb53:artifact",
          appliedAt: 1_700_000_000_000,
        }}
        plan={{
          valid: true,
          errors: [],
          byKind: {
            attribute: {
              ...EMPTY_DIFF,
              changed: ["matter.status"],
            },
            entityType: EMPTY_DIFF,
            form: EMPTY_DIFF,
            flow: EMPTY_DIFF,
            requirement: EMPTY_DIFF,
            action: EMPTY_DIFF,
          },
          dangerous: [],
        }}
      />,
    );

    expect(html).toContain("Drift");
    expect(html).toContain("Draft vs Live");
    expect(html).toContain("differs");
    expect(html).toContain("Draft vs Active");
    expect(html).toContain("active");
    expect(html).toContain("1 change");
    expect(html).toContain("matter.status");
  });

  it("renders account config drift loading, invalid, and missing mirror states", () => {
    const invalidHtml = renderToStaticMarkup(
      <AccountConfigDriftPanel
        draft={null}
        live={undefined}
        active={undefined}
        plan={undefined}
      />,
    );

    expect(invalidHtml).toContain("Draft vs Live");
    expect(invalidHtml).toContain("draft cannot be parsed");
    expect(invalidHtml).toContain("Draft vs Active");
    expect(invalidHtml).toContain("loading active deployment");
    expect(invalidHtml).toContain("Plan Drift");
    expect(invalidHtml).toContain("waiting");
    expect(invalidHtml).toContain("dry-run plan unavailable");
    expect(invalidHtml).toContain("Draft artifact");
    expect(invalidHtml).toContain("invalid");
    expect(invalidHtml).toContain("Parse the source to compute drift.");
    expect(invalidHtml).toContain("Live mirror");
    expect(invalidHtml).toContain("loading");
    expect(invalidHtml).toContain("Loading exported tenant config...");

    const missingHtml = renderToStaticMarkup(
      <AccountConfigDriftPanel
        draft={{
          sourceDigest: "cyrb53:source",
          artifactDigest: "cyrb53:artifact",
          manifest: {
            attributes: ["matter.status"],
            entityTypes: ["Matter"],
            forms: ["conflict_check"],
          },
          diagnostics: ["flow matter_intake collects unknown form intake"],
        }}
        live={null}
        active={null}
        plan={{
          valid: false,
          errors: ["unknown form intake"],
          byKind: {
            attribute: EMPTY_DIFF,
            entityType: EMPTY_DIFF,
            form: EMPTY_DIFF,
            flow: EMPTY_DIFF,
            requirement: EMPTY_DIFF,
            action: EMPTY_DIFF,
          },
          dangerous: [],
        }}
      />,
    );

    expect(missingHtml).toContain("live mirror unavailable");
    expect(missingHtml).toContain("no active deployment");
    expect(missingHtml).toContain("No exported live config to compare.");
    expect(missingHtml).toContain("Draft diagnostics affect deploy readiness");
    expect(missingHtml).toContain("flow matter_intake collects unknown form intake");
  });

  it("renders account config resource graph edges and Mermaid artifact", () => {
    const html = renderToStaticMarkup(
      <AccountConfigResourceGraphPanel
        edges={[
          {
            fromKind: "entityType",
            fromName: "Matter",
            relation: "flow",
            toKind: "flow",
            toName: "matter_intake",
          },
          {
            fromKind: "flow",
            fromName: "matter_intake",
            relation: "collect",
            toKind: "form",
            toName: "conflict_check",
          },
        ]}
        mermaid={
          'graph LR\n  entityType_Matter["entityType: Matter"]:::entityType\n  entityType_Matter -- "flow" --> flow_matter_intake\n'
        }
        expanded={false}
      />,
    );

    expect(html).toContain("Resource graph");
    expect(html).toContain("Relations");
    expect(html).toContain("collect 1");
    expect(html).toContain("flow 1");
    expect(html).toContain("Matter flow matter_intake");
    expect(html).toContain("matter_intake collect conflict_check");
    expect(html).toContain("Mermaid");
    expect(html).toContain("review artifact");
    expect(html).toContain("graph LR");
    expect(html).toContain("entityType_Matter");
    expect(html).toContain("<textarea");
    expect(html).toContain("readOnly");
  });

  it("renders distinct checked-in staffing and legal account config graphs", () => {
    const staffing = graphReviewForForma(staffingFormaSource);
    const legal = graphReviewForForma(legalFormaSource);

    expect(staffing.edges.length).toBeGreaterThan(legal.edges.length);
    expect(staffing.html).toContain("Resource graph");
    expect(staffing.html).toContain("Relations");
    expect(staffing.html).toContain("collect 1");
    expect(staffing.html).toContain("guard 1");
    expect(staffing.html).toContain("requires 4");
    expect(staffing.html).toContain("Worker flow onboarding");
    expect(staffing.html).toContain("onboarding collect i9");
    expect(staffing.html).toContain("forklift scope job");
    expect(staffing.html).toContain("forklift guard role");
    expect(staffing.html).toContain("venue_disclosure scope venue");
    expect(staffing.html).not.toContain("Matter flow matter_intake");
    expect(staffing.mermaid).toContain("%% account: Acme Staffing / acme-staffing");

    expect(legal.html).toContain("Resource graph");
    expect(legal.html).toContain("Relations");
    expect(legal.html).toContain("collect 2");
    expect(legal.html).toContain("asserts 2");
    expect(legal.html).toContain("scope 3");
    expect(legal.html).toContain("Matter flow matter_intake");
    expect(legal.html).toContain("matter_intake collect conflict_check");
    expect(legal.html).toContain("matter_intake collect engagement_letter");
    expect(legal.html).toContain("matter_intake asserts matter.status");
    expect(legal.html).toContain("conflict_check scope client");
    expect(legal.html).not.toContain("Worker flow onboarding");
    expect(legal.mermaid).toContain("%% account: Legal Workflows / legal-workflows");
  });

  it("renders normalized source diffs as a review artifact", () => {
    const html = renderToStaticMarkup(
      <AccountConfigSourceDiffPanel
        diff={{
          changed: true,
          added: 1,
          removed: 1,
          truncated: false,
          lines: [
            {
              kind: "removed",
              text: "(tenant legal-workflows)",
              oldLine: 1,
            },
            {
              kind: "added",
              text: '(tenant legal-workflows "Legal Workflows" legal)',
              newLine: 1,
            },
          ],
        }}
      />,
    );

    expect(html).toContain("Normalized diff");
    expect(html).toContain("needs normalize");
    expect(html).toContain("2 shown");
    expect(html).toContain("+1 / -1");
    expect(html).toContain("(tenant legal-workflows)");
    expect(html).toContain("Legal Workflows");
  });

  it("renders truncated normalized source diff review metadata", () => {
    const html = renderToStaticMarkup(
      <AccountConfigSourceDiffPanel
        diff={{
          changed: true,
          added: 5,
          removed: 4,
          truncated: true,
          lines: [
            {
              kind: "added",
              text: "(attr client entityRef)",
              newLine: 12,
            },
            {
              kind: "removed",
              text: "(attribute client entityRef)",
              oldLine: 14,
            },
          ],
        }}
      />,
    );

    expect(html).toContain("Normalized diff");
    expect(html).toContain("needs normalize");
    expect(html).toContain("2 shown");
    expect(html).toContain("+5 / -4");
    expect(html).toContain("truncated");
    expect(html).toContain("Diff truncated for review.");
  });

  it("renders normalized source diff digest review metadata", () => {
    const matchingHtml = renderToStaticMarkup(
      <AccountConfigSourceDiffPanel
        diff={{
          changed: true,
          added: 1,
          removed: 1,
          truncated: false,
          lines: [
            {
              kind: "added",
              text: "(attributes)",
              newLine: 2,
            },
          ],
        }}
        review={{
          format: "forma",
          sourceDigest: "cyrb53:source",
          normalizedDigest: "cyrb53:normalized",
          checkedInPath: "configs/accounts/legal-workflows.forma",
          checkedInDigest: "cyrb53:source",
        }}
      />,
    );

    expect(matchingHtml).toContain("Format");
    expect(matchingHtml).toContain("forma");
    expect(matchingHtml).toContain("Source");
    expect(matchingHtml).toContain("cyrb53:source");
    expect(matchingHtml).toContain("Normalized");
    expect(matchingHtml).toContain("cyrb53:normalized");
    expect(matchingHtml).toContain("Checked in");
    expect(matchingHtml).toContain("configs/accounts/legal-workflows.forma");
    expect(matchingHtml).toContain("checked-in matches");

    const differingHtml = renderToStaticMarkup(
      <AccountConfigSourceDiffPanel
        diff={{
          changed: false,
          added: 0,
          removed: 0,
          truncated: false,
          lines: [],
        }}
        review={{
          sourceDigest: "cyrb53:draft",
          checkedInDigest: "cyrb53:checked-in",
        }}
      />,
    );

    expect(differingHtml).toContain("checked-in differs");
  });

  it("renders formatted normalized source reviews without line diffs", () => {
    const html = renderToStaticMarkup(
      <AccountConfigSourceDiffPanel
        diff={{
          changed: false,
          added: 0,
          removed: 0,
          truncated: false,
          lines: [],
        }}
      />,
    );

    expect(html).toContain("Normalized diff");
    expect(html).toContain("formatted");
    expect(html).toContain("0 shown");
    expect(html).toContain("The draft already matches the normalized source form.");
    expect(html).not.toContain("needs normalize");
    expect(html).not.toContain("+0 / -0");
  });

  it("renders the account config deploy workflow states", () => {
    const html = renderToStaticMarkup(
      <AccountConfigWorkflowPanel
        sourceFormat="forma"
        sourceReady
        diagnosticsCount={1}
        review={{
          checkedInPath: "configs/accounts/legal-workflows.forma",
          checkedInDigest: "cyrb53:checked-in",
          draftDigest: "cyrb53:draft",
          normalized: false,
          normalizedDigest: "cyrb53:normalized",
          graphEdgeCount: 4,
          navigationCount: 6,
        }}
        plan={{
          valid: true,
          errors: [],
          byKind: {
            attribute: EMPTY_DIFF,
            entityType: EMPTY_DIFF,
            form: EMPTY_DIFF,
            flow: EMPTY_DIFF,
            requirement: EMPTY_DIFF,
            action: EMPTY_DIFF,
          },
          dangerous: [
            {
              kind: "requirement",
              value: "forklift",
              reason: "Removing a requirement can close obligations.",
            },
          ],
        }}
        plans={[
          {
            _id: "plan-approved",
            tenantSlug: "legal-workflows",
            status: "approved",
            sourceDigest: "cyrb53:source",
            artifactDigest: "cyrb53:artifact",
            empty: false,
            destructive: false,
            createdAt: 1_700_000_000_000,
            updatedAt: 1_700_000_000_000,
          },
        ]}
        active={{
          artifactDigest: "cyrb53:artifact",
          appliedAt: 1_700_000_000_000,
        }}
      />,
    );

    expect(html).toContain("Workflow");
    expect(html).toContain("Source");
    expect(html).toContain("configs/accounts/legal-workflows.forma");
    expect(html).toContain("draft");
    expect(html).toContain("Parse");
    expect(html).toContain("1 warning");
    expect(html).toContain("FORMA source");
    expect(html).toContain("Normalize &amp; Graph");
    expect(html).toContain("needs normalize");
    expect(html).toContain("4 edges / 6 jumps");
    expect(html).toContain("Plan");
    expect(html).toContain("1 approved");
    expect(html).toContain("1 dangerous change");
    expect(html).toContain("Active");
    expect(html).toContain("active artifact");
  });

  it("renders blocked account config workflow states before source is deployable", () => {
    const html = renderToStaticMarkup(
      <AccountConfigWorkflowPanel
        sourceFormat={null}
        sourceReady={false}
        diagnosticsCount={2}
        review={{
          checkedInPath: null,
          checkedInDigest: null,
          draftDigest: null,
          normalized: null,
          normalizedDigest: null,
          graphEdgeCount: 0,
          navigationCount: 0,
        }}
        plan={{
          valid: false,
          errors: ["account missing name", "form intake missing title"],
          byKind: {
            attribute: EMPTY_DIFF,
            entityType: EMPTY_DIFF,
            form: EMPTY_DIFF,
            flow: EMPTY_DIFF,
            requirement: EMPTY_DIFF,
            action: EMPTY_DIFF,
          },
          dangerous: [],
        }}
        plans={undefined}
        active={null}
      />,
    );

    expect(html).toContain("Workflow");
    expect(html).toContain("no checked-in source selected");
    expect(html).toContain("read-only");
    expect(html).toContain("Parse");
    expect(html).toContain("blocked");
    expect(html).toContain("unparsed source");
    expect(html).toContain("Normalize &amp; Graph");
    expect(html).toContain("waiting");
    expect(html).toContain("0 edges / 0 jumps");
    expect(html).toContain("Plan");
    expect(html).toContain("loading");
    expect(html).toContain("0 dangerous changes");
    expect(html).toContain("Active");
    expect(html).toContain("not deployed");
    expect(html).toContain("no apply timestamp");
  });

  it("renders account config history filters and manifest changes", () => {
    const html = renderToStaticMarkup(
      <AccountConfigHistoryPanel
        filter="requirement"
        onFilterChange={() => undefined}
        history={[
          {
            txId: "tx-review",
            txTime: 1_700_000_000_000,
            actorId: "config",
            reason: "apply account deploy plan",
            added: [{ kind: "requirement", value: "conflict_check" }],
            removed: [{ kind: "flow", value: "old_intake" }],
            totalManifestChanges: 2,
            changedKinds: ["requirement", "flow"],
            afterCounts: { attributes: 3, forms: 2, flows: 1 },
            eventCounts: { assert: 8, retract: 2 },
          },
          {
            txId: "tx-idempotent",
            txTime: 1_700_000_100_000,
            added: [],
            removed: [],
            totalManifestChanges: 0,
          },
        ]}
      />,
    );

    expect(html).toContain("History");
    expect(html).toContain("Requirements");
    expect(html).toContain('value="changes"');
    expect(html).toContain('value="requirement" selected');
    expect(html).toContain("apply account deploy plan");
    expect(html).toContain("Tx");
    expect(html).toContain("tx-review");
    expect(html).toContain("Actor");
    expect(html).toContain("config");
    expect(html).toContain("Kinds");
    expect(html).toContain("requirement, flow");
    expect(html).toContain("Events");
    expect(html).toContain(">10</code>");
    expect(html).toContain("Manifest");
    expect(html).toContain(">6</code>");
    expect(html).toContain("Audit");
    expect(html).toContain("2 manifest changes");
    expect(html).toContain("+1");
    expect(html).toContain("-1");
    expect(html).toContain("+ requirement:conflict_check");
    expect(html).toContain("- flow:old_intake");
    expect(html).toContain("idempotent apply");
    expect(html).toContain("+0");
    expect(html).toContain("-0");
    expect(html).toContain("idempotent");
  });

  it("renders account config history loading and empty review states", () => {
    const loadingHtml = renderToStaticMarkup(
      <AccountConfigHistoryPanel
        filter="changes"
        onFilterChange={() => undefined}
        history={undefined}
      />,
    );

    expect(loadingHtml).toContain("History");
    expect(loadingHtml).toContain("Manifest changes");
    expect(loadingHtml).toContain('value="changes" selected');
    expect(loadingHtml).toContain("Loading...");

    const emptyHtml = renderToStaticMarkup(
      <AccountConfigHistoryPanel
        filter="action"
        onFilterChange={() => undefined}
        history={[]}
      />,
    );

    expect(emptyHtml).toContain("History");
    expect(emptyHtml).toContain("Actions");
    expect(emptyHtml).toContain('value="action" selected');
    expect(emptyHtml).toContain("No matching config applies yet.");
  });

  it("renders active deployment approval, apply, and rollback affordances", () => {
    const html = renderToStaticMarkup(
      <AccountDeploymentPanel
        active={{
          activePlanId: "plan-applied",
          sourceDigest: "cyrb53:source",
          artifactDigest: "cyrb53:artifact",
          appliedBy: "user:deployer",
          appliedAt: 1_700_000_000_000,
          plan: {
            _id: "plan-applied",
            tenantSlug: "legal-workflows",
            status: "applied",
            sourceDigest: "cyrb53:source",
            artifactDigest: "cyrb53:artifact",
            empty: false,
            destructive: false,
            createdAt: 1_700_000_000_000,
            updatedAt: 1_700_000_000_000,
          },
        }}
        plans={[
          {
            _id: "plan-draft",
            tenantSlug: "legal-workflows",
            status: "planned",
            sourceDigest: "cyrb53:next-source",
            artifactDigest: "cyrb53:next-artifact",
            empty: false,
            destructive: true,
            baselineActivePlanId: "plan-applied",
            baselineArtifactDigest: "cyrb53:artifact",
            baselineAppliedAt: 1_700_000_000_000,
            review: {
              source: {
                digest: "cyrb53:next-source",
                format: "forma",
                preview: '(entity-type "Matter")',
                draft: {
                  id: "draft-main",
                  name: "main",
                  sourceDigest: "cyrb53:next-source",
                  checkedInPath: "configs/accounts/legal-workflows.forma",
                  checkedInDigest: "cyrb53:checked-in",
                  reviewNote: "Matter workflow source review",
                  updatedBy: "user:author",
                },
              },
              artifact: {
                digest: "cyrb53:next-artifact",
                preview: '{\n  "kind": "metacrdt.account.deploy"\n}',
                manifest: {
                  attributes: ["matter.status"],
                  entityTypes: ["Matter"],
                  forms: ["conflict_check"],
                },
              },
              resourceGraph: {
                digest: "cyrb53:graph",
                edgeCount: 2,
                edges: [
                  {
                    fromKind: "entityType",
                    fromName: "Matter",
                    relation: "flow",
                    toKind: "flow",
                    toName: "matter_intake",
                  },
                  {
                    fromKind: "flow",
                    fromName: "matter_intake",
                    relation: "collect",
                    toKind: "form",
                    toName: "conflict_check",
                  },
                ],
              },
              diff: {
                totals: {
                  attribute: { added: 1, changed: 0, removed: 0 },
                  entityType: { added: 0, changed: 1, removed: 0 },
                },
                dangerous: [
                  {
                    kind: "requirement",
                    value: "forklift",
                    reason: "Removing a requirement can close obligations.",
                  },
                ],
              },
            },
            createdAt: 1_700_000_100_000,
            updatedAt: 1_700_000_100_000,
          },
          {
            _id: "plan-approved",
            tenantSlug: "legal-workflows",
            status: "approved",
            sourceDigest: "cyrb53:approved-source",
            artifactDigest: "cyrb53:approved-artifact",
            empty: false,
            destructive: false,
            approvedBy: "user:reviewer",
            approvedAt: 1_700_000_120_000,
            createdAt: 1_700_000_110_000,
            updatedAt: 1_700_000_120_000,
          },
          {
            _id: "plan-rollback",
            tenantSlug: "legal-workflows",
            status: "planned",
            sourceDigest: "cyrb53:source",
            artifactDigest: "cyrb53:artifact",
            empty: false,
            destructive: false,
            rollbackOfPlanId: "plan-applied",
            review: {
              rollbackOfPlanId: "plan-applied",
              rollbackTarget: {
                planId: "plan-applied",
                sourceDigest: "cyrb53:source",
                artifactDigest: "cyrb53:artifact",
                appliedAt: 1_700_000_000_000,
              },
            },
            createdAt: 1_700_000_130_000,
            updatedAt: 1_700_000_130_000,
          },
          {
            _id: "plan-rollback-approved",
            tenantSlug: "legal-workflows",
            status: "approved",
            sourceDigest: "cyrb53:source",
            artifactDigest: "cyrb53:artifact",
            empty: false,
            destructive: false,
            rollbackOfPlanId: "plan-applied",
            review: {
              rollbackOfPlanId: "plan-applied",
              rollbackTarget: {
                planId: "plan-applied",
                artifactDigest: "cyrb53:artifact",
              },
            },
            createdAt: 1_700_000_140_000,
            updatedAt: 1_700_000_140_000,
          },
          {
            _id: "plan-applied",
            tenantSlug: "legal-workflows",
            status: "applied",
            sourceDigest: "cyrb53:source",
            artifactDigest: "cyrb53:artifact",
            empty: false,
            destructive: false,
            createdAt: 1_700_000_000_000,
            updatedAt: 1_700_000_000_000,
          },
        ]}
        sourceDiff={{
          changed: true,
          added: 1,
          removed: 1,
          truncated: false,
          lines: [
            {
              kind: "removed",
              text: "(tenant legal-workflows)",
              oldLine: 1,
            },
            {
              kind: "added",
              text: '(tenant legal-workflows "Legal Workflows" legal)',
              newLine: 1,
            },
          ],
        }}
        sourceDiffReview={{
          format: "forma",
          sourceDigest: "cyrb53:next-source",
          normalizedDigest: "cyrb53:next-normalized",
          checkedInPath: "configs/accounts/legal-workflows.forma",
          checkedInDigest: "cyrb53:checked-in",
        }}
        drift={{
          draft: {
            sourceDigest: "cyrb53:draft-source",
            artifactDigest: "cyrb53:draft-artifact",
            manifest: {
              attributes: ["matter.status"],
            },
            diagnostics: [],
          },
          live: {
            sourceDigest: "cyrb53:live-source",
            artifactDigest: "cyrb53:live-artifact",
            manifest: {
              attributes: ["matter.status"],
            },
            diagnostics: [],
          },
          plan: {
            valid: true,
            errors: [],
            byKind: {
              attribute: {
                added: ["matter.status"],
                changed: [],
                removed: [],
                unchanged: [],
              },
              entityType: {
                added: [],
                changed: ["Matter"],
                removed: [],
                unchanged: [],
              },
              form: {
                added: [],
                changed: [],
                removed: [],
                unchanged: [],
              },
              flow: {
                added: [],
                changed: [],
                removed: [],
                unchanged: [],
              },
              requirement: {
                added: [],
                changed: [],
                removed: [],
                unchanged: [],
              },
              action: {
                added: [],
                changed: [],
                removed: [],
                unchanged: [],
              },
            },
            dangerous: [],
          },
        }}
        busy={false}
        onApprovePlan={() => undefined}
        onApplyPlan={() => undefined}
        onRollbackPlan={() => undefined}
      />,
    );

    expect(html).toContain("Active deployment");
    expect(html).toContain("cyrb53:artifact");
    expect(html).toContain("user:deployer");
    expect(html).toContain("Review artifact");
    expect(html).toContain("Draft review");
    expect(html).toContain("checked-in differs");
    expect(html).toContain("configs/accounts/legal-workflows.forma");
    expect(html).toContain("Matter workflow source review");
    expect(html).toContain("Review snapshot");
    expect(html).toContain(
      "pnpm account-config review-deploy --tenant legal-workflows --plan plan-draft --output yaml",
    );
    expect(html).toContain("matches active baseline");
    expect(html).toContain("&quot;planId&quot;: &quot;plan-draft&quot;");
    expect(html).toContain("Active baseline");
    expect(html).toContain("will replace active");
    expect(html).toContain("Manifest");
    expect(html).toContain("3 resources");
    expect(html).toContain("Drift dry run");
    expect(html).toContain("2 dry-run changes");
    expect(html).toContain("Draft drift");
    expect(html).toContain("cyrb53:draft-artifact");
    expect(html).toContain("Live mirror");
    expect(html).toContain("cyrb53:live-artifact");
    expect(html).toContain("Normalized diff");
    expect(html).toContain("needs normalize");
    expect(html).toContain("cyrb53:next-normalized");
    expect(html).toContain("Includes dangerous changes");
    expect(html).toContain("Semantic diff");
    expect(html).toContain("attribute +1");
    expect(html).toContain("Artifact manifest");
    expect(html).toContain("forms 1");
    expect(html).toContain("Resource graph");
    expect(html).toContain("2 edges");
    expect(html).toContain("cyrb53:graph");
    expect(html).toContain("Matter flow matter_intake");
    expect(html).toContain("requirement:forklift");
    expect(html).toContain("Source payload");
    expect(html).toContain("(entity-type &quot;Matter&quot;)");
    expect(html).toContain("Artifact payload");
    expect(html).toContain("metacrdt.account.deploy");
    expect(html).toContain("Approve Plan");
    expect(html).toContain("Apply Plan");
    expect(html).toContain("Plan Rollback");
    expect(html).toContain("Rollback target");
    expect(html).toContain("Source");
    expect(html).toContain("Rollback plan");
    expect(html).toContain("Approve Rollback");
    expect(html).toContain("Apply Rollback");
    expect(html).toContain("Applied");
    expect(html).toContain("unknown");
  });

  it("renders deployment loading and no-plan states", () => {
    const loadingHtml = renderToStaticMarkup(
      <AccountDeploymentPanel
        active={undefined}
        plans={undefined}
        busy={false}
        onApprovePlan={() => undefined}
        onApplyPlan={() => undefined}
        onRollbackPlan={() => undefined}
      />,
    );

    expect(loadingHtml).toContain("Deployment");
    expect(loadingHtml).toContain("Loading active deployment");
    expect(loadingHtml).toContain("Loading deployment plans");

    const emptyHtml = renderToStaticMarkup(
      <AccountDeploymentPanel
        active={null}
        plans={[]}
        busy={false}
        onApprovePlan={() => undefined}
        onApplyPlan={() => undefined}
        onRollbackPlan={() => undefined}
      />,
    );

    expect(emptyHtml).toContain("No active deployment");
    expect(emptyHtml).toContain(
      "Create a deployment plan from the draft source, then apply it.",
    );
    expect(emptyHtml).toContain("No deployment plans yet.");
    expect(emptyHtml).not.toContain("Review artifact");
    expect(emptyHtml).not.toContain("Approve Plan");
  });

  it("renders deployment plan reviews while active baseline is still loading", () => {
    const html = renderToStaticMarkup(
      <AccountDeploymentPanel
        active={undefined}
        plans={[
          {
            _id: "plan-waiting-active",
            tenantSlug: "legal-workflows",
            status: "planned",
            sourceDigest: "cyrb53:draft-source",
            artifactDigest: "cyrb53:draft-artifact",
            empty: false,
            destructive: false,
            review: {
              source: {
                digest: "cyrb53:draft-source",
                format: "forma",
              },
              artifact: {
                digest: "cyrb53:draft-artifact",
                manifest: {
                  attributes: ["matter.status"],
                },
              },
              resourceGraph: {
                digest: "cyrb53:graph-truncated",
                edgeCount: 12,
                truncated: true,
                edges: [
                  {
                    fromKind: "flow",
                    fromName: "matter_intake",
                    relation: "collect",
                    toKind: "form",
                    toName: "conflict_check",
                  },
                ],
              },
              diff: {
                totals: {
                  attribute: { added: 1, changed: 0, removed: 0 },
                },
                dangerous: [],
              },
            },
            createdAt: 1_700_000_100_000,
            updatedAt: 1_700_000_100_000,
          },
        ]}
        busy={false}
        onApprovePlan={() => undefined}
        onApplyPlan={() => undefined}
        onRollbackPlan={() => undefined}
      />,
    );

    expect(html).toContain("Loading active deployment");
    expect(html).toContain("Review artifact");
    expect(html).toContain("Active baseline");
    expect(html).toContain("loading active");
    expect(html).toContain("12+ edges");
    expect(html).toContain("cyrb53:graph-truncated");
    expect(html).toContain("matter_intake collect conflict_check");
    expect(html).toContain("Review snapshot");
    expect(html).toContain("checking");
    expect(html).toContain("loading active deployment");
    expect(html).toContain(
      "pnpm account-config review-deploy --tenant legal-workflows --plan plan-waiting-active --output yaml",
    );
    expect(html).toContain("&quot;stale&quot;: null");
    expect(html).toContain("Approve Plan");
  });

  it("renders stale deployment plan review warnings against the current active state", () => {
    const html = renderToStaticMarkup(
      <AccountDeploymentPanel
        active={{
          activePlanId: "plan-new-active",
          sourceDigest: "cyrb53:new-source",
          artifactDigest: "cyrb53:new-artifact",
          appliedBy: "user:deployer",
          appliedAt: 1_700_000_200_000,
        }}
        plans={[
          {
            _id: "plan-stale",
            tenantSlug: "staffing-demo",
            status: "planned",
            sourceDigest: "cyrb53:draft-source",
            artifactDigest: "cyrb53:draft-artifact",
            empty: false,
            destructive: false,
            baselineActivePlanId: "plan-old-active",
            baselineArtifactDigest: "cyrb53:old-artifact",
            baselineAppliedAt: 1_700_000_000_000,
            review: {
              source: {
                digest: "cyrb53:draft-source",
                format: "forma",
                draft: {
                  id: "draft-staffing",
                  name: "staffing-main",
                  sourceDigest: "cyrb53:draft-source",
                  checkedInPath: "configs/accounts/staffing.forma",
                  checkedInDigest: "cyrb53:draft-source",
                },
              },
              artifact: {
                digest: "cyrb53:draft-artifact",
                manifest: {
                  attributes: ["worker.status"],
                  entityTypes: ["Worker"],
                },
              },
              diff: {
                totals: {
                  attribute: { added: 0, changed: 1, removed: 0 },
                },
                dangerous: [],
              },
            },
            createdAt: 1_700_000_100_000,
            updatedAt: 1_700_000_100_000,
          },
        ]}
        busy={false}
        onApprovePlan={() => undefined}
        onApplyPlan={() => undefined}
        onRollbackPlan={() => undefined}
      />,
    );

    expect(html).toContain("Review artifact");
    expect(html).toContain("stale");
    expect(html).toContain(
      "expected active artifact cyrb53:old-artifact, found cyrb53:new-artifact",
    );
    expect(html).toContain("will replace active");
    expect(html).toContain(
      "pnpm account-config review-deploy --tenant staffing-demo --plan plan-stale --output yaml",
    );
    expect(html).toContain("&quot;stale&quot;: true");
    expect(html).toContain("checked-in matches");
    expect(html).toContain("Artifact manifest");
    expect(html).toContain("entityTypes 1");
    expect(html).toContain(
      "Active deployment changed after this plan was reviewed.",
    );
    expect(html).toContain("Approve Plan");
    expect(html).toContain("disabled");
  });

  it("blocks apply controls for approved stale deployment plans", () => {
    const html = renderToStaticMarkup(
      <AccountDeploymentPanel
        active={{
          activePlanId: "plan-new-active",
          sourceDigest: "cyrb53:new-source",
          artifactDigest: "cyrb53:new-artifact",
          appliedBy: "user:deployer",
          appliedAt: 1_700_000_200_000,
        }}
        plans={[
          {
            _id: "plan-approved-stale",
            tenantSlug: "legal-workflows",
            status: "approved",
            sourceDigest: "cyrb53:draft-source",
            artifactDigest: "cyrb53:draft-artifact",
            empty: false,
            destructive: false,
            baselineActivePlanId: "plan-old-active",
            baselineArtifactDigest: "cyrb53:old-artifact",
            baselineAppliedAt: 1_700_000_000_000,
            approvedBy: "user:approver",
            approvedAt: 1_700_000_100_000,
            review: {
              source: {
                digest: "cyrb53:draft-source",
                format: "forma",
              },
              artifact: {
                digest: "cyrb53:draft-artifact",
                manifest: {
                  attributes: ["matter.status"],
                },
              },
              diff: {
                totals: {
                  attribute: { added: 1, changed: 0, removed: 0 },
                },
                dangerous: [],
              },
            },
            createdAt: 1_700_000_050_000,
            updatedAt: 1_700_000_100_000,
          },
        ]}
        busy={false}
        onApprovePlan={() => undefined}
        onApplyPlan={() => undefined}
        onRollbackPlan={() => undefined}
      />,
    );

    expect(html).toContain("stale");
    expect(html).toContain(
      "expected active artifact cyrb53:old-artifact, found cyrb53:new-artifact",
    );
    expect(html).toContain(
      "Active deployment changed after this plan was reviewed.",
    );
    expect(html).toContain("Apply Plan");
    expect(html).toContain("disabled");
    expect(html).toContain("&quot;stale&quot;: true");
  });

  it("renders failed deployment plan reviews without deploy controls", () => {
    const html = renderToStaticMarkup(
      <AccountDeploymentPanel
        active={{
          activePlanId: "plan-active",
          sourceDigest: "cyrb53:active-source",
          artifactDigest: "cyrb53:active-artifact",
          appliedBy: "user:deployer",
          appliedAt: 1_700_000_000_000,
        }}
        plans={[
          {
            _id: "plan-failed",
            tenantSlug: "legal-workflows",
            status: "failed",
            sourceDigest: "cyrb53:failed-source",
            artifactDigest: "cyrb53:failed-artifact",
            empty: false,
            destructive: false,
            baselineActivePlanId: "plan-active",
            baselineArtifactDigest: "cyrb53:active-artifact",
            baselineAppliedAt: 1_700_000_000_000,
            review: {
              source: {
                digest: "cyrb53:failed-source",
                format: "forma",
              },
              artifact: {
                digest: "cyrb53:failed-artifact",
                manifest: {
                  attributes: ["matter.status"],
                },
              },
              diff: {
                totals: {
                  attribute: { added: 1, changed: 0, removed: 0 },
                },
                dangerous: [],
              },
            },
            error: "apply failed: conflict_check form is locked",
            createdAt: 1_700_000_100_000,
            updatedAt: 1_700_000_120_000,
          },
        ]}
        busy={false}
        onApprovePlan={() => undefined}
        onApplyPlan={() => undefined}
        onRollbackPlan={() => undefined}
      />,
    );

    expect(html).toContain("Review artifact");
    expect(html).toContain("failed");
    expect(html).toContain("Deployment failed");
    expect(html).toContain("apply failed: conflict_check form is locked");
    expect(html).toContain("matches active baseline");
    expect(html).toContain(
      "pnpm account-config review-deploy --tenant legal-workflows --plan plan-failed --output yaml",
    );
    expect(html).toContain("&quot;status&quot;: &quot;failed&quot;");
    expect(html).not.toContain("Ready to apply");
    expect(html).not.toContain("Approve Plan");
    expect(html).not.toContain("Apply Plan");
  });

  it("renders idempotent empty deployment plans as fresh no-change reviews", () => {
    const html = renderToStaticMarkup(
      <AccountDeploymentPanel
        active={{
          activePlanId: "plan-active",
          sourceDigest: "cyrb53:source",
          artifactDigest: "cyrb53:artifact",
          appliedBy: "user:deployer",
          appliedAt: 1_700_000_000_000,
        }}
        plans={[
          {
            _id: "plan-empty",
            tenantSlug: "legal-workflows",
            status: "planned",
            sourceDigest: "cyrb53:source",
            artifactDigest: "cyrb53:artifact",
            empty: true,
            destructive: false,
            baselineActivePlanId: "plan-active",
            baselineArtifactDigest: "cyrb53:artifact",
            baselineAppliedAt: 1_700_000_000_000,
            review: {
              source: {
                digest: "cyrb53:source",
                format: "forma",
              },
              artifact: {
                digest: "cyrb53:artifact",
                manifest: {
                  attributes: ["matter.status"],
                  entityTypes: ["Matter"],
                },
              },
              diff: {
                totals: {
                  attribute: { added: 0, changed: 0, removed: 0 },
                  entityType: { added: 0, changed: 0, removed: 0 },
                },
                dangerous: [],
              },
            },
            createdAt: 1_700_000_100_000,
            updatedAt: 1_700_000_100_000,
          },
        ]}
        busy={false}
        onApprovePlan={() => undefined}
        onApplyPlan={() => undefined}
        onRollbackPlan={() => undefined}
      />,
    );

    expect(html).toContain("Review artifact");
    expect(html).toContain("No runtime changes");
    expect(html).toContain("fresh");
    expect(html).toContain("matches active baseline");
    expect(html).toContain("matches active");
    expect(html).toContain("Semantic diff");
    expect(html).toContain("0 changes");
    expect(html).toContain("Dangerous changes");
    expect(html).toContain("0");
    expect(html).toContain("Artifact manifest");
    expect(html).toContain("entityTypes 1");
    expect(html).toContain(
      "pnpm account-config review-deploy --tenant legal-workflows --plan plan-empty --output yaml",
    );
    expect(html).toContain("&quot;empty&quot;: true");
    expect(html).toContain("Approve Plan");
  });

  it("renders empty rollback plans as already active", () => {
    const html = renderToStaticMarkup(
      <AccountDeploymentPanel
        active={{
          activePlanId: "plan-applied",
          sourceDigest: "cyrb53:source",
          artifactDigest: "cyrb53:artifact",
          appliedBy: "user:deployer",
          appliedAt: 1_700_000_000_000,
        }}
        plans={[
          {
            _id: "plan-rollback-empty",
            tenantSlug: "legal-workflows",
            status: "planned",
            sourceDigest: "cyrb53:source",
            artifactDigest: "cyrb53:artifact",
            empty: true,
            destructive: false,
            rollbackOfPlanId: "plan-applied",
            baselineActivePlanId: "plan-applied",
            baselineArtifactDigest: "cyrb53:artifact",
            baselineAppliedAt: 1_700_000_000_000,
            review: {
              rollbackOfPlanId: "plan-applied",
              rollbackTarget: {
                planId: "plan-applied",
                sourceDigest: "cyrb53:source",
                artifactDigest: "cyrb53:artifact",
                appliedAt: 1_700_000_000_000,
              },
            },
            createdAt: 1_700_000_200_000,
            updatedAt: 1_700_000_200_000,
          },
        ]}
        busy={false}
        onApprovePlan={() => undefined}
        onApplyPlan={() => undefined}
        onRollbackPlan={() => undefined}
      />,
    );

    expect(html).toContain("Rollback is already active");
    expect(html).toContain("Rollback of");
    expect(html).toContain("plan-applied");
    expect(html).toContain("Rollback target");
    expect(html).toContain("Source");
    expect(html).toContain("cyrb53:source");
    expect(html).toContain("cyrb53:artifact");
    expect(html).toContain("Applied");
    expect(html).toContain("fresh");
    expect(html).toContain("matches active baseline");
    expect(html).toContain(
      "pnpm account-config review-deploy --tenant legal-workflows --plan plan-rollback-empty --output yaml",
    );
    expect(html).toContain("&quot;rollbackOfPlanId&quot;: &quot;plan-applied&quot;");
    expect(html).toContain("&quot;empty&quot;: true");
    expect(html).toContain("Approve Rollback");
  });
});
