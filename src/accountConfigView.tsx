import {
  AlertTriangle,
  CheckCircle2,
  Download,
  GitCompare,
  ListPlus,
  LocateFixed,
  Play,
  Trash2,
} from "lucide-react";
import type { AccountConfigResourceGraphEdge } from "@metacrdt/account-config";
import type { AccountConfigSourceLineDiff } from "./configSource";
import { Button, Card, CardHeader, Chip, Mono, shortId } from "./ui";

export type ConfigKind =
  | "attribute"
  | "entityType"
  | "form"
  | "flow"
  | "requirement"
  | "action";

export const ACCOUNT_CONFIG_HISTORY_FILTERS = [
  { value: "all", label: "All applies" },
  { value: "changes", label: "Manifest changes" },
  { value: "attribute", label: "Attributes" },
  { value: "entityType", label: "Types" },
  { value: "form", label: "Forms" },
  { value: "flow", label: "Flows" },
  { value: "requirement", label: "Requirements" },
  { value: "action", label: "Actions" },
] as const;

export type AccountConfigHistoryFilter =
  typeof ACCOUNT_CONFIG_HISTORY_FILTERS[number]["value"];

export function accountConfigHistoryFilterLabel(
  value: AccountConfigHistoryFilter,
): string {
  return ACCOUNT_CONFIG_HISTORY_FILTERS.find((filter) => filter.value === value)?.label ??
    "All applies";
}

export type PlanDiff = {
  added: string[];
  changed: string[];
  removed: string[];
  unchanged: string[];
};

export type AccountMetadataChange = {
  action?: "added" | "changed" | "unchanged";
  before?: { slug?: string; name?: string; kind?: string } | null;
  after?: { slug?: string; name?: string; kind?: string };
  changedFields?: string[];
};

export type AccountConfigPlan = {
  valid: boolean;
  errors: string[];
  accountChange?: AccountMetadataChange;
  byKind: Record<ConfigKind, PlanDiff>;
  dangerous: { kind: string; value: string; reason: string }[];
};

export type AccountConfigDriftSnapshot = {
  sourceDigest: string;
  artifactDigest: string;
  manifest: Partial<Record<string, string[]>>;
  diagnostics: string[];
};

export type AccountConfigWorkflowReview = {
  checkedInPath?: string | null;
  checkedInDigest?: string | null;
  draftDigest?: string | null;
  normalized?: boolean | null;
  normalizedDigest?: string | null;
  graphEdgeCount: number;
  navigationCount: number;
};

export type AccountConfigSourceDiffReview = {
  format?: string | null;
  sourceDigest?: string | null;
  normalizedDigest?: string | null;
  checkedInPath?: string | null;
  checkedInDigest?: string | null;
};

export type AccountDeploymentDriftReview = {
  draft?: AccountConfigDriftSnapshot | null;
  live?: AccountConfigDriftSnapshot | null;
  plan?: AccountConfigPlan | null;
};

export type AccountConfigCompletionSuggestion = {
  label: string;
  detail: string;
  source: string;
  sourceAware: boolean;
};

export type AccountConfigSourceDiagnostic = {
  message: string;
  loc?: { line: number; col: number };
  path?: string;
};

export type AccountConfigDraftReview = {
  sourceDigest: string;
  checkedInPath?: string;
  checkedInDigest?: string;
  reviewNote?: string;
  validation?: {
    valid: boolean;
    errors: string[];
  };
};

export type AccountConfigSavedDraftOption = {
  _id: string;
  name: string;
  sourceFormat: string;
  updatedAt: number;
};

export type AccountConfigCheckedInSourceOption = {
  path: string;
  label: string;
};

function manifestTotal(manifest: Partial<Record<string, string[]>>): number {
  return Object.values(manifest).reduce((total, values) => total + (values?.length ?? 0), 0);
}

function countTotal(counts: Record<string, number>): number {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

function snapshotCounts(snapshot: AccountConfigDriftSnapshot): [string, number][] {
  return Object.entries(snapshot.manifest).map(([kind, values]) => [kind, values?.length ?? 0]);
}

function snapshotResourcePreview(snapshot: AccountConfigDriftSnapshot): string[] {
  return Object.entries(snapshot.manifest)
    .flatMap(([kind, values]) => (values ?? []).map((value) => `${kind}:${value}`))
    .slice(0, 6);
}

function graphRelationCounts(edges: AccountConfigResourceGraphEdge[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const edge of edges) {
    counts.set(edge.relation, (counts.get(edge.relation) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function accountMetadataChanged(change: AccountMetadataChange | undefined): boolean {
  return change?.action === "added" || change?.action === "changed";
}

function accountChangeSummary(change: AccountMetadataChange): string {
  if (change.action === "added") return "account metadata added";
  const fields = change.changedFields ?? [];
  if (fields.length === 0) return "account metadata changed";
  return `account ${fields.join(", ")} changed`;
}

export function AccountConfigCompletionPanel({
  suggestions,
  selectedIndex,
  disabled,
  onSelectedIndexChange,
  onInsert,
}: {
  suggestions: AccountConfigCompletionSuggestion[];
  selectedIndex: number;
  disabled?: boolean;
  onSelectedIndexChange: (index: number) => void;
  onInsert: () => void;
}) {
  const resolvedIndex = Math.min(selectedIndex, Math.max(0, suggestions.length - 1));
  const selected = suggestions[resolvedIndex];
  const controlsDisabled = disabled === true || suggestions.length === 0;

  return (
    <div className="rounded-md border border-line-soft bg-canvas p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-muted">Completions</span>
        <select
          value={resolvedIndex}
          disabled={controlsDisabled}
          onChange={(event) => onSelectedIndexChange(Number(event.currentTarget.value))}
          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1.5 text-[12px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
        >
          {suggestions.length === 0 ? (
            <option value={0}>No snippets available</option>
          ) : (
            suggestions.map((suggestion, index) => (
              <option key={suggestion.label} value={index}>
                {suggestion.sourceAware ? "Draft: " : "Template: "}
                {suggestion.label} - {suggestion.detail}
              </option>
            ))
          )}
        </select>
        <Button variant="outline" disabled={controlsDisabled} onClick={onInsert}>
          <ListPlus className="h-3.5 w-3.5" />
          Insert snippet
        </Button>
      </div>
      {selected !== undefined && (
        <div className="mt-2 rounded-md border border-line bg-surface p-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[12px] font-semibold text-ink">
                {selected.label}
              </div>
              <div className="mt-0.5 text-[11px] text-muted">{selected.detail}</div>
            </div>
            <Chip tone={selected.sourceAware ? "data" : "system"}>
              {selected.sourceAware ? "source-aware" : "template"}
            </Chip>
          </div>
          <pre className="mt-2 max-h-40 overflow-auto rounded-md border border-line-soft bg-canvas p-2 font-mono text-[11px] leading-relaxed text-ink">
            {selected.source}
          </pre>
        </div>
      )}
    </div>
  );
}

function diagnosticLocationLabel(diagnostic: AccountConfigSourceDiagnostic): string | null {
  if (diagnostic.loc) {
    const path = diagnostic.path ? `${diagnostic.path} ` : "";
    return `${path}line ${diagnostic.loc.line}, col ${diagnostic.loc.col}`;
  }
  return diagnostic.path ?? null;
}

export function AccountConfigSourceDiagnosticsPanel({
  diagnostics,
  onFocusLine,
}: {
  diagnostics: AccountConfigSourceDiagnostic[];
  onFocusLine?: (line: number) => void;
}) {
  if (diagnostics.length === 0) return null;
  return (
    <div className="rounded-md border border-orange/30 bg-orange-soft p-3">
      <div className="text-[12px] font-semibold text-orange-ink">
        Source diagnostics ({diagnostics.length})
      </div>
      <ul className="mt-2 space-y-1 text-[12px] text-orange-ink">
        {diagnostics.map((diagnostic, index) => {
          const location = diagnosticLocationLabel(diagnostic);
          return (
            <li
              key={`${diagnostic.message}:${index}`}
              className="flex items-start justify-between gap-2"
            >
              <span className="min-w-0">
                {location && (
                  <span className="font-mono text-[11px]">
                    {location}
                  </span>
                )}
                {location ? " - " : ""}
                {diagnostic.message}
              </span>
              {diagnostic.loc !== undefined && onFocusLine !== undefined && (
                <Button
                  variant="ghost"
                  onClick={() => onFocusLine(diagnostic.loc!.line)}
                >
                  <LocateFixed className="h-3.5 w-3.5" />
                  Go
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function AccountConfigDraftReviewPanel({
  draft,
  notice,
}: {
  draft?: AccountConfigDraftReview | null;
  notice?: string | null;
}) {
  if (draft === undefined && (notice === undefined || notice === null)) return null;
  const checkedInMatches =
    draft?.checkedInPath !== undefined &&
    draft.sourceDigest === draft.checkedInDigest;
  const issueCount = draft?.validation?.errors.length ?? 0;

  return (
    <div className="rounded-md border border-line-soft bg-canvas p-2">
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
        {notice !== undefined && notice !== null && <span>{notice}</span>}
        {draft !== undefined && draft !== null && (
          <>
            <Chip tone={draft.validation?.valid === false ? "system" : "configured"}>
              {draft.validation === undefined
                ? "not parsed"
                : draft.validation.valid
                  ? "valid"
                  : `${issueCount} issue${issueCount === 1 ? "" : "s"}`}
            </Chip>
            {draft.checkedInPath !== undefined && (
              <>
                <Chip tone={checkedInMatches ? "configured" : "data"}>
                  {checkedInMatches ? "checked-in matches" : "checked-in differs"}
                </Chip>
                <Chip tone="system">{draft.checkedInPath}</Chip>
              </>
            )}
            <Mono>{draft.sourceDigest}</Mono>
          </>
        )}
      </div>
      {draft?.reviewNote !== undefined && draft.reviewNote.trim() !== "" && (
        <p className="text-[12px] text-ink">{draft.reviewNote}</p>
      )}
    </div>
  );
}

export function AccountConfigSavedDraftSelector({
  drafts,
  selectedDraftId,
  busy,
  onSelectDraft,
  onLoadDraft,
  onDeleteDraft,
}: {
  drafts: AccountConfigSavedDraftOption[] | undefined;
  selectedDraftId: string;
  busy: boolean;
  onSelectDraft: (draftId: string) => void;
  onLoadDraft: () => void;
  onDeleteDraft: () => void;
}) {
  const selectedDraft = drafts?.find((draft) => draft._id === selectedDraftId);
  const hasDrafts = drafts !== undefined && drafts.length > 0;

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <select
        value={selectedDraftId}
        disabled={!hasDrafts}
        onChange={(event) => onSelectDraft(event.currentTarget.value)}
        className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1.5 text-[12px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
        aria-label="Saved draft"
      >
        <option value="">
          {drafts === undefined
            ? "Loading saved drafts"
            : drafts.length === 0
              ? "No saved drafts"
              : "Select saved draft"}
        </option>
        {drafts?.map((draft) => (
          <option key={draft._id} value={draft._id}>
            {draft.name} - {draft.sourceFormat.toUpperCase()} -{" "}
            {new Date(draft.updatedAt).toLocaleString()}
          </option>
        ))}
      </select>
      {drafts !== undefined && (
        <Chip tone={hasDrafts ? "configured" : "system"}>
          {drafts.length} saved
        </Chip>
      )}
      <Button
        variant="outline"
        disabled={selectedDraft === undefined}
        onClick={onLoadDraft}
      >
        <Download className="h-3.5 w-3.5" />
        Load
      </Button>
      <Button
        variant="ghost"
        disabled={busy || selectedDraft === undefined}
        onClick={onDeleteDraft}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </Button>
    </div>
  );
}

export function AccountConfigCheckedInSourceSelector({
  sources,
  selectedPath,
  draftOpen,
  draftMatchesSelected,
  onSelectSource,
  onLoadSource,
}: {
  sources: AccountConfigCheckedInSourceOption[];
  selectedPath: string;
  draftOpen: boolean;
  draftMatchesSelected: boolean;
  onSelectSource: (path: string) => void;
  onLoadSource: () => void;
}) {
  const selectedSource =
    sources.find((source) => source.path === selectedPath) ?? sources[0];
  const hasSources = sources.length > 0;

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <select
        value={selectedSource?.path ?? ""}
        disabled={!hasSources}
        onChange={(event) => onSelectSource(event.currentTarget.value)}
        className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1.5 text-[12px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
        aria-label="Checked-in source"
      >
        {!hasSources && (
          <option value="">No checked-in source for tenant</option>
        )}
        {sources.map((entry) => (
          <option key={entry.path} value={entry.path}>
            {entry.label} - {entry.path}
          </option>
        ))}
      </select>
      <Button
        variant="outline"
        disabled={selectedSource === undefined}
        onClick={onLoadSource}
      >
        <Download className="h-3.5 w-3.5" />
        Load source
      </Button>
      {selectedSource !== undefined && (
        <Chip tone={draftOpen && draftMatchesSelected ? "configured" : "data"}>
          {draftOpen && draftMatchesSelected ? "matches" : "differs"}
        </Chip>
      )}
    </div>
  );
}

export function AccountConfigSourceDiffPanel({
  diff,
  review,
}: {
  diff: AccountConfigSourceLineDiff | null;
  review?: AccountConfigSourceDiffReview;
}) {
  if (diff === null) return null;
  const checkedInStatus =
    review?.sourceDigest === undefined ||
    review.sourceDigest === null ||
    review.checkedInDigest === undefined ||
    review.checkedInDigest === null
      ? null
      : review.sourceDigest === review.checkedInDigest
        ? "checked-in matches"
        : "checked-in differs";
  return (
    <div className="mt-3 rounded-md border border-line p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Normalized diff
        </span>
        <div className="flex items-center gap-1.5">
          <Chip tone={diff.changed ? "data" : "configured"}>
            {diff.changed ? "needs normalize" : "formatted"}
          </Chip>
          <Chip tone="system">{diff.lines.length} shown</Chip>
          {diff.changed && (
            <Chip tone="neutral">
              +{diff.added} / -{diff.removed}
            </Chip>
          )}
          {diff.truncated && <Chip tone="data">truncated</Chip>}
        </div>
      </div>
      {review !== undefined && (
        <div className="mt-2 grid gap-1 rounded-md border border-line-soft bg-canvas p-2 text-[11px] text-muted md:grid-cols-2">
          {review.format !== undefined && review.format !== null && (
            <div>
              Format <Mono>{review.format}</Mono>
            </div>
          )}
          {review.sourceDigest !== undefined && review.sourceDigest !== null && (
            <div>
              Source <Mono>{review.sourceDigest}</Mono>
            </div>
          )}
          {review.normalizedDigest !== undefined &&
            review.normalizedDigest !== null && (
              <div>
                Normalized <Mono>{review.normalizedDigest}</Mono>
              </div>
            )}
          {review.checkedInPath !== undefined && review.checkedInPath !== null && (
            <div>
              Checked in <Mono>{review.checkedInPath}</Mono>
            </div>
          )}
          {checkedInStatus !== null && (
            <div>
              Checked-in status <Mono>{checkedInStatus}</Mono>
            </div>
          )}
        </div>
      )}
      {diff.changed ? (
        <div className="mt-2 max-h-72 overflow-auto rounded-md border border-line-soft bg-canvas font-mono text-[11px] leading-relaxed">
          {diff.lines.map((line, index) => {
            const marker = line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " ";
            const tone =
              line.kind === "added"
                ? "bg-green-soft text-green"
                : line.kind === "removed"
                  ? "bg-red-soft text-red-ink"
                  : "text-muted";
            return (
              <div
                key={`${line.kind}:${line.oldLine ?? ""}:${line.newLine ?? ""}:${index}`}
                className={`grid grid-cols-[3rem_1rem_minmax(0,1fr)] gap-2 px-2 py-0.5 ${tone}`}
              >
                <span className="select-none text-right text-muted">
                  {line.newLine ?? line.oldLine ?? ""}
                </span>
                <span className="select-none">{marker}</span>
                <span className="whitespace-pre">{line.text}</span>
              </div>
            );
          })}
          {diff.truncated && (
            <div className="border-t border-line-soft px-2 py-1 text-[11px] text-muted">
              Diff truncated for review.
            </div>
          )}
        </div>
      ) : (
        <p className="mt-2 text-[12px] text-muted">
          The draft already matches the normalized source form.
        </p>
      )}
    </div>
  );
}

export function AccountConfigResourceGraphPanel({
  edges,
  mermaid,
  expanded,
}: {
  edges: AccountConfigResourceGraphEdge[];
  mermaid: string;
  expanded: boolean;
}) {
  if (edges.length === 0) return null;
  const relationCounts = graphRelationCounts(edges);
  return (
    <div className="mt-3 rounded-md border border-line p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Resource graph
        </span>
        <span className="tnum text-[11px] text-muted">{edges.length}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <span>Relations</span>
        {relationCounts.map(([relation, count]) => (
          <Chip key={relation} tone="neutral">
            {relation} {count}
          </Chip>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {edges.slice(0, expanded ? undefined : 8).map((edge) => (
          <Chip
            key={`${edge.fromKind}:${edge.fromName}:${edge.relation}:${edge.toKind}:${edge.toName}`}
            tone="neutral"
          >
            {edge.fromName} {edge.relation} {edge.toName}
          </Chip>
        ))}
        {!expanded && edges.length > 8 && (
          <span className="text-[12px] text-muted">+{edges.length - 8} more</span>
        )}
      </div>
      <div className="mt-3 rounded-md border border-line-soft bg-canvas p-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Mermaid
          </span>
          <Chip tone="system">review artifact</Chip>
        </div>
        <textarea
          readOnly
          value={mermaid}
          rows={expanded ? 14 : 6}
          className="block w-full resize-y rounded-md border border-line bg-surface p-2 font-mono text-[11px] leading-relaxed text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
        />
      </div>
    </div>
  );
}

export function AccountConfigDriftPanel({
  draft,
  live,
  active,
  plan,
}: {
  draft: AccountConfigDriftSnapshot | null;
  live: AccountConfigDriftSnapshot | null | undefined;
  active: AccountDeploymentState | null | undefined;
  plan: AccountConfigPlan | undefined;
}) {
  const liveReady = live !== undefined;
  const draftMatchesLive =
    draft !== null && live !== null && live !== undefined &&
    draft.artifactDigest === live.artifactDigest;
  const draftMatchesActive =
    draft !== null && active !== null && active !== undefined &&
    active.artifactDigest === draft.artifactDigest;
  const liveMatchesActive =
    live !== null && live !== undefined && active !== null && active !== undefined &&
    active.artifactDigest === live.artifactDigest;
  const plannedChanges =
    plan === undefined
      ? null
      : Object.values(plan.byKind).reduce(
          (total, diff) => total + diff.added.length + diff.changed.length + diff.removed.length,
          0,
        ) + (accountMetadataChanged(plan.accountChange) ? 1 : 0);

  return (
    <Card>
      <CardHeader title="Drift" hint="source mirror" />
      <div className="space-y-4 p-5">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-md border border-line p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[12px] font-semibold text-ink">Draft vs Live</div>
              <Chip tone={draftMatchesLive ? "configured" : "data"}>
                {draftMatchesLive ? "in sync" : "differs"}
              </Chip>
            </div>
            <div className="mt-2 text-[12px] text-muted">
              {draft === null
                ? "draft cannot be parsed"
                : !liveReady
                  ? "loading live mirror"
                  : live === null
                    ? "live mirror unavailable"
                    : `${manifestTotal(draft.manifest)} draft resources / ${manifestTotal(live.manifest)} live resources`}
            </div>
          </div>
          <div className="rounded-md border border-line p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[12px] font-semibold text-ink">Draft vs Active</div>
              <Chip tone={draftMatchesActive ? "configured" : "system"}>
                {draftMatchesActive ? "active" : "not active"}
              </Chip>
            </div>
            <div className="mt-2 text-[12px] text-muted">
              {active === undefined
                ? "loading active deployment"
                : active === null
                  ? "no active deployment"
                  : `active artifact ${shortId(active.artifactDigest ?? "unknown")}`}
            </div>
          </div>
          <div className="rounded-md border border-line p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[12px] font-semibold text-ink">Plan Drift</div>
              <Chip tone={plannedChanges === 0 ? "configured" : "data"}>
                {plannedChanges === null
                  ? "waiting"
                  : `${plannedChanges} change${plannedChanges === 1 ? "" : "s"}`}
              </Chip>
            </div>
            <div className="mt-2 text-[12px] text-muted">
              {plan === undefined
                ? "dry-run plan unavailable"
                : `${plan.dangerous.length} dangerous change${plan.dangerous.length === 1 ? "" : "s"}`}
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-line-soft p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[12px] font-semibold text-ink">Draft artifact</span>
              {draft === null ? (
                <Chip tone="system">invalid</Chip>
              ) : (
                <Chip tone="data">{shortId(draft.artifactDigest)}</Chip>
              )}
            </div>
            {draft === null ? (
              <p className="text-[12px] text-muted">Parse the source to compute drift.</p>
            ) : (
              <div className="space-y-2">
                <div className="grid gap-1 text-[12px] text-muted">
                  <div>
                    Source <Mono>{draft.sourceDigest}</Mono>
                  </div>
                  <div>
                    Artifact <Mono>{draft.artifactDigest}</Mono>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {snapshotCounts(draft).map(([kind, count]) => (
                    <Chip key={kind} tone={count > 0 ? "configured" : "system"}>
                      {kind} {count}
                    </Chip>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {snapshotResourcePreview(draft).map((resource) => (
                    <Chip key={resource} tone="neutral">
                      {resource}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-md border border-line-soft p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[12px] font-semibold text-ink">Live mirror</span>
              {!liveReady ? (
                <Chip tone="system">loading</Chip>
              ) : live === null ? (
                <Chip tone="system">unavailable</Chip>
              ) : (
                <Chip tone={liveMatchesActive ? "configured" : "data"}>
                  {shortId(live.artifactDigest)}
                </Chip>
              )}
            </div>
            {!liveReady ? (
              <p className="text-[12px] text-muted">Loading exported tenant config...</p>
            ) : live === null ? (
              <p className="text-[12px] text-muted">No exported live config to compare.</p>
            ) : (
              <div className="space-y-2">
                <div className="grid gap-1 text-[12px] text-muted">
                  <div>
                    Source <Mono>{live.sourceDigest}</Mono>
                  </div>
                  <div>
                    Artifact <Mono>{live.artifactDigest}</Mono>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {snapshotCounts(live).map(([kind, count]) => (
                    <Chip key={kind} tone={count > 0 ? "configured" : "system"}>
                      {kind} {count}
                    </Chip>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {snapshotResourcePreview(live).map((resource) => (
                    <Chip key={resource} tone="neutral">
                      {resource}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {(draft?.diagnostics.length ?? 0) > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-center gap-2 text-[12px] font-semibold text-amber-900">
              <AlertTriangle className="h-3.5 w-3.5" />
              Draft diagnostics affect deploy readiness
            </div>
            <ul className="mt-2 space-y-1 text-[12px] text-amber-800">
              {draft?.diagnostics.map((diagnostic) => (
                <li key={diagnostic}>{diagnostic}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

export function AccountConfigWorkflowPanel({
  sourceFormat,
  sourceReady,
  diagnosticsCount,
  review,
  plan,
  active,
  plans,
}: {
  sourceFormat: string | null;
  sourceReady: boolean;
  diagnosticsCount: number;
  review?: AccountConfigWorkflowReview;
  plan: AccountConfigPlan | undefined;
  active: AccountDeploymentState | null | undefined;
  plans: AccountDeploymentPlan[] | undefined;
}) {
  const plannedCount = plans?.filter((entry) => entry.status === "planned").length ?? 0;
  const approvedCount = plans?.filter((entry) => entry.status === "approved").length ?? 0;
  const sourceMatchesCheckedIn =
    review?.checkedInDigest !== undefined &&
    review.checkedInDigest !== null &&
    review.draftDigest === review.checkedInDigest;
  const draftTone = !sourceReady ? "system" : diagnosticsCount > 0 ? "data" : "configured";
  const draftStatus = !sourceReady
    ? "blocked"
    : diagnosticsCount > 0
      ? `${diagnosticsCount} warning${diagnosticsCount === 1 ? "" : "s"}`
      : "ready";
  const sourceStatus =
    review?.draftDigest === undefined || review.draftDigest === null
      ? "read-only"
      : sourceMatchesCheckedIn
        ? "checked-in"
        : "draft";
  const sourceTone =
    review?.draftDigest === undefined || review.draftDigest === null
      ? "system"
      : sourceMatchesCheckedIn
        ? "configured"
        : "data";
  const normalizeStatus =
    review?.normalized === undefined || review.normalized === null
      ? "waiting"
      : review.normalized
        ? "formatted"
        : "needs normalize";
  const normalizeTone =
    review?.normalized === undefined || review.normalized === null
      ? "system"
      : review.normalized
        ? "configured"
        : "data";
  const graphStatus =
    review === undefined
      ? "waiting"
      : `${review.graphEdgeCount} edge${review.graphEdgeCount === 1 ? "" : "s"}`;
  const reviewStatus =
    plans === undefined
      ? "loading"
      : approvedCount > 0
        ? `${approvedCount} approved`
        : plannedCount > 0
          ? `${plannedCount} awaiting approval`
          : plan === undefined
            ? "waiting"
            : plan.valid
              ? "ready to plan"
              : "blocked";
  const reviewTone =
    approvedCount > 0 ? "configured" : plannedCount > 0 || plan?.valid ? "data" : "system";
  const activeStatus =
    active === undefined
      ? "loading"
      : active === null
        ? "not deployed"
        : `active ${shortId(active.artifactDigest ?? "unknown")}`;
  const activeTone = active === null || active === undefined ? "system" : "configured";

  return (
    <Card>
      <CardHeader title="Workflow" hint="deploy loop" />
      <div className="grid gap-3 p-5 md:grid-cols-5">
        <div className="rounded-md border border-line p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[12px] font-semibold text-ink">Source</div>
            <Chip tone={sourceTone}>{sourceStatus}</Chip>
          </div>
          <div className="mt-2 text-[12px] text-muted">
            {review?.checkedInPath === undefined || review.checkedInPath === null
              ? "no checked-in source selected"
              : review.checkedInPath}
          </div>
        </div>
        <div className="rounded-md border border-line p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[12px] font-semibold text-ink">Parse</div>
            <Chip tone={draftTone}>{draftStatus}</Chip>
          </div>
          <div className="mt-2 text-[12px] text-muted">
            {sourceFormat === null ? "unparsed source" : `${sourceFormat.toUpperCase()} source`}
          </div>
        </div>
        <div className="rounded-md border border-line p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[12px] font-semibold text-ink">Normalize &amp; Graph</div>
            <Chip tone={normalizeTone}>{normalizeStatus}</Chip>
          </div>
          <div className="mt-2 text-[12px] text-muted">
            {graphStatus}
            {review === undefined
              ? ""
              : ` / ${review.navigationCount} jump${review.navigationCount === 1 ? "" : "s"}`}
          </div>
        </div>
        <div className="rounded-md border border-line p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[12px] font-semibold text-ink">Plan</div>
            <Chip tone={reviewTone}>{reviewStatus}</Chip>
          </div>
          <div className="mt-2 text-[12px] text-muted">
            {plan === undefined
              ? "plan not available"
              : `${plan.dangerous.length} dangerous change${plan.dangerous.length === 1 ? "" : "s"}`}
          </div>
        </div>
        <div className="rounded-md border border-line p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[12px] font-semibold text-ink">Active</div>
            <Chip tone={activeTone}>{activeStatus}</Chip>
          </div>
          <div className="mt-2 text-[12px] text-muted">
            {active?.appliedAt === undefined
              ? "no apply timestamp"
              : new Date(active.appliedAt).toLocaleString()}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function AccountConfigPlanPanel({
  plan,
}: {
  plan: AccountConfigPlan | undefined;
}) {
  return (
    <Card>
      <CardHeader title="Plan" hint="dry run" />
      {plan === undefined ? (
        <p className="p-5 text-[13px] text-muted">Waiting for valid config source...</p>
      ) : (
        <div className="space-y-4 p-5">
          <div className="flex items-center gap-2 text-[13px]">
            <CheckCircle2 className="h-4 w-4 text-green" />
            <span className="font-medium text-ink">
              {plan.valid ? "Valid config shape" : "Config has errors"}
            </span>
          </div>
          {plan.errors.length > 0 && (
            <ul className="space-y-1 text-[12px] text-red-ink">
              {plan.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
          {accountMetadataChanged(plan.accountChange) && plan.accountChange !== undefined && (
            <div className="rounded-md border border-line p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12px] font-semibold text-ink">account</span>
                <span className="text-[11px] text-muted">
                  {accountChangeSummary(plan.accountChange)}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Chip tone="data">
                  {plan.accountChange.before?.name ?? "new account"} {"->"}{" "}
                  {plan.accountChange.after?.name ?? "unknown"}
                </Chip>
                {(plan.accountChange.changedFields ?? []).map((field) => (
                  <Chip key={field} tone="neutral">
                    {field}
                  </Chip>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-3">
            {Object.entries(plan.byKind).map(([kind, diff]) => (
              <div key={kind} className="rounded-md border border-line p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-ink">
                    {kind}
                  </span>
                  <span className="text-[11px] text-muted">
                    +{diff.added.length} / ~{diff.changed.length} / -
                    {diff.removed.length}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {diff.added.map((item) => (
                    <Chip key={`add:${kind}:${item}`} tone="configured">
                      + {item}
                    </Chip>
                  ))}
                  {diff.changed.map((item) => (
                    <Chip key={`chg:${kind}:${item}`} tone="data">
                      ~ {item}
                    </Chip>
                  ))}
                  {diff.removed.map((item) => (
                    <Chip key={`rm:${kind}:${item}`} tone="system">
                      - {item}
                    </Chip>
                  ))}
                  {diff.added.length === 0 &&
                    diff.changed.length === 0 &&
                    diff.removed.length === 0 && (
                      <span className="text-[12px] text-muted">no changes</span>
                    )}
                </div>
              </div>
            ))}
          </div>
          {plan.dangerous.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <div className="text-[12px] font-semibold text-amber-900">
                Dangerous changes
              </div>
              <ul className="mt-2 space-y-1 text-[12px] text-amber-800">
                {plan.dangerous.map((item) => (
                  <li key={`${item.kind}:${item.value}`}>
                    {item.kind}:{item.value} - {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export type AccountConfigApplyJob = {
  _id: string;
  status: "pending" | "running" | "completed" | "failed";
  attempts: number;
  updatedAt: number;
  error?: string;
};

export type AccountConfigHistoryChange = {
  kind: string;
  value: string;
};

export type AccountConfigHistoryTransaction = {
  txId: string;
  txTime: number;
  actorId?: string;
  reason?: string;
  added: AccountConfigHistoryChange[];
  removed: AccountConfigHistoryChange[];
  totalManifestChanges: number;
  changedKinds?: string[];
  afterCounts?: Record<string, number>;
  eventCounts?: Record<string, number>;
};

export function AccountConfigHistoryPanel({
  history,
  filter,
  onFilterChange,
}: {
  history: AccountConfigHistoryTransaction[] | undefined;
  filter: AccountConfigHistoryFilter;
  onFilterChange: (filter: AccountConfigHistoryFilter) => void;
}) {
  return (
    <Card>
      <CardHeader title="History" hint={accountConfigHistoryFilterLabel(filter)} />
      <div className="border-b border-line-soft px-5 py-3">
        <label className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
          <span>Show</span>
          <select
            value={filter}
            onChange={(event) =>
              onFilterChange(event.currentTarget.value as AccountConfigHistoryFilter)
            }
            className="rounded-md border border-line bg-surface px-2 py-1.5 text-[12px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
          >
            {ACCOUNT_CONFIG_HISTORY_FILTERS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {history === undefined ? (
        <p className="p-5 text-[13px] text-muted">Loading...</p>
      ) : history.length === 0 ? (
        <p className="p-5 text-[13px] text-muted">
          No matching config applies yet.
        </p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {history.map((tx) => (
            <li key={tx.txId} className="px-5 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] font-medium text-ink">
                  {tx.reason ?? "config transaction"}
                </span>
                <Mono>{new Date(tx.txTime).toLocaleString()}</Mono>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                <span>
                  Tx <Mono>{shortId(tx.txId)}</Mono>
                </span>
                {tx.actorId !== undefined && (
                  <span>
                    Actor <Mono>{tx.actorId}</Mono>
                  </span>
                )}
                {tx.changedKinds !== undefined && tx.changedKinds.length > 0 && (
                  <span>
                    Kinds <Mono>{tx.changedKinds.join(", ")}</Mono>
                  </span>
                )}
                {tx.eventCounts !== undefined && (
                  <span>
                    Events <Mono>{countTotal(tx.eventCounts)}</Mono>
                  </span>
                )}
                {tx.afterCounts !== undefined && (
                  <span>
                    Manifest <Mono>{countTotal(tx.afterCounts)}</Mono>
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                <span>Audit</span>
                <Chip tone={tx.totalManifestChanges > 0 ? "data" : "configured"}>
                  {tx.totalManifestChanges === 0
                    ? "idempotent apply"
                    : `${tx.totalManifestChanges} manifest change${
                        tx.totalManifestChanges === 1 ? "" : "s"
                      }`}
                </Chip>
                <Chip tone={tx.added.length > 0 ? "configured" : "system"}>
                  +{tx.added.length}
                </Chip>
                <Chip tone={tx.removed.length > 0 ? "system" : "configured"}>
                  -{tx.removed.length}
                </Chip>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tx.added.map((item) => (
                  <Chip key={`add:${item.kind}:${item.value}`} tone="configured">
                    + {item.kind}:{item.value}
                  </Chip>
                ))}
                {tx.removed.map((item) => (
                  <Chip key={`rm:${item.kind}:${item.value}`} tone="system">
                    - {item.kind}:{item.value}
                  </Chip>
                ))}
                {tx.totalManifestChanges === 0 && (
                  <span className="text-[12px] text-muted">idempotent</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function AccountConfigApplyJobsPanel({
  applyJobs,
  busy,
  onRetry,
}: {
  applyJobs: AccountConfigApplyJob[] | undefined;
  busy: boolean;
  onRetry: (jobId: string) => void;
}) {
  return (
    <Card>
      <CardHeader title="Apply Jobs" hint="recent status" />
      {applyJobs === undefined ? (
        <p className="p-5 text-[13px] text-muted">Loading...</p>
      ) : applyJobs.length === 0 ? (
        <p className="p-5 text-[13px] text-muted">No apply jobs yet.</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {applyJobs.map((job) => (
            <li key={job._id} className="space-y-2 px-5 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Chip
                    tone={
                      job.status === "completed"
                        ? "configured"
                        : job.status === "failed"
                          ? "system"
                          : "data"
                    }
                  >
                    {job.status}
                  </Chip>
                  <span className="text-[12px] text-muted">
                    attempt {job.attempts}
                  </span>
                </div>
                <Mono>{new Date(job.updatedAt).toLocaleString()}</Mono>
              </div>
              {job.error !== undefined && (
                <pre className="whitespace-pre-wrap rounded-md bg-red-soft p-2 text-[12px] text-red-ink">
                  {job.error}
                </pre>
              )}
              {job.status === "failed" && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => onRetry(job._id)}
                >
                  <Play className="h-3.5 w-3.5" />
                  Retry
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export type AccountDeploymentPlan = {
  _id: string;
  tenantSlug: string;
  status: "planned" | "approved" | "applied" | "failed";
  sourceDigest: string;
  artifactDigest: string;
  empty: boolean;
  destructive: boolean;
  draftId?: string;
  rollbackOfPlanId?: string;
  baselineActivePlanId?: string;
  baselineArtifactDigest?: string;
  baselineAppliedAt?: number;
  approvedBy?: string;
  approvedAt?: number;
  summary?: unknown;
  review?: {
    source?: {
      digest?: string;
      format?: string;
      preview?: string;
      draft?: {
        id?: string;
        name?: string;
        sourceFormat?: string;
        sourceDigest?: string;
        checkedInPath?: string;
        checkedInDigest?: string;
        reviewNote?: string;
        artifactDigest?: string;
        updatedAt?: number;
        updatedBy?: string;
      };
    };
    artifact?: {
      digest?: string;
      manifest?: Record<string, string[]>;
      preview?: string;
    };
    diff?: {
      accountChange?: AccountMetadataChange;
      totals?: Record<
        string,
        {
          added?: number;
          changed?: number;
          removed?: number;
          unchanged?: number;
        }
      >;
      dangerous?: { kind: string; value: string; reason: string }[];
    };
    resourceGraph?: {
      digest?: string;
      edgeCount?: number;
      edges?: AccountConfigResourceGraphEdge[];
      truncated?: boolean;
    };
    rollbackOfPlanId?: string;
    rollbackTarget?: {
      planId?: string;
      sourceDigest?: string;
      artifactDigest?: string;
      appliedAt?: number;
    };
  };
  error?: string;
  createdAt: number;
  updatedAt: number;
  appliedAt?: number;
};

export type AccountDeploymentState = {
  activePlanId?: string;
  sourceDigest?: string;
  artifactDigest?: string;
  appliedBy?: string;
  appliedAt?: number;
  plan?: AccountDeploymentPlan | null;
};

function AccountDeploymentReviewSnapshot({
  active,
  plan,
}: {
  active: AccountDeploymentState | null | undefined;
  plan: AccountDeploymentPlan;
}) {
  const staleness = deploymentPlanStaleness(plan, active);
  return (
    <details className="rounded-md border border-line-soft p-2">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-[12px] font-medium text-ink">
        <span>Review snapshot</span>
        <span className="flex items-center gap-1.5">
          <Chip
            tone={
              staleness.stale === true
                ? "system"
                : staleness.stale === false
                  ? "configured"
                  : "data"
            }
          >
            {staleness.stale === true
              ? "stale"
              : staleness.stale === false
                ? "fresh"
                : "checking"}
          </Chip>
          <Mono>{plan._id}</Mono>
        </span>
      </summary>
      <div className="mt-2 space-y-2">
        <div className="rounded-md bg-canvas p-2 text-[12px] text-muted">
          Export{" "}
          <Mono>
            pnpm account-config review-deploy --tenant {plan.tenantSlug} --plan{" "}
            {plan._id} --output yaml
          </Mono>
        </div>
        <p className="text-[12px] text-muted">{staleness.message}</p>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-canvas p-2 font-mono text-[11px] text-ink-2">
          {reviewSnapshotText(plan, active)}
        </pre>
      </div>
    </details>
  );
}

function deploymentTone(status: AccountDeploymentPlan["status"]) {
  if (status === "applied") return "configured";
  if (status === "failed") return "system";
  return "data";
}

function deploymentSummary(plan: AccountDeploymentPlan): string {
  if (plan.status === "failed") return "Deployment failed";
  if (plan.rollbackOfPlanId !== undefined || plan.review?.rollbackOfPlanId !== undefined) {
    if (plan.empty) return "Rollback is already active";
    return "Rollback plan";
  }
  if (plan.empty) return "No runtime changes";
  if (plan.destructive) return "Includes dangerous changes";
  return "Ready to apply";
}

function draftCheckedInStatus(plan: AccountDeploymentPlan): string | undefined {
  const draft = plan.review?.source?.draft;
  if (
    draft?.checkedInPath === undefined ||
    draft.checkedInDigest === undefined ||
    draft.sourceDigest === undefined
  ) {
    return undefined;
  }
  return draft.sourceDigest === draft.checkedInDigest
    ? "checked-in matches"
    : "checked-in differs";
}

function manifestCounts(plan: AccountDeploymentPlan): [string, number][] {
  const manifest = plan.review?.artifact?.manifest;
  if (manifest === undefined) return [];
  return Object.entries(manifest).map(([key, values]) => [key, values.length]);
}

function graphEdges(plan: AccountDeploymentPlan): AccountConfigResourceGraphEdge[] {
  return plan.review?.resourceGraph?.edges ?? [];
}

function diffTotals(plan: AccountDeploymentPlan): [string, {
  added?: number;
  changed?: number;
  removed?: number;
}][] {
  const totals = plan.review?.diff?.totals;
  if (totals === undefined) return [];
  return Object.entries(totals).map(([key, value]) => [key, value]);
}

function planAccountChange(plan: AccountDeploymentPlan): AccountMetadataChange | undefined {
  return plan.review?.diff?.accountChange;
}

function hasPayloadPreview(plan: AccountDeploymentPlan): boolean {
  return (
    plan.review?.source?.preview !== undefined ||
    plan.review?.artifact?.preview !== undefined
  );
}

function isRollbackPlan(plan: AccountDeploymentPlan): boolean {
  return plan.rollbackOfPlanId !== undefined || plan.review?.rollbackOfPlanId !== undefined;
}

function deploymentReviewCandidate(
  plans: AccountDeploymentPlan[] | undefined,
): AccountDeploymentPlan | undefined {
  if (plans === undefined || plans.length === 0) return undefined;
  return (
    plans.find((plan) => plan.status === "approved" || plan.status === "planned") ??
    plans[0]
  );
}

function planManifestTotal(plan: AccountDeploymentPlan): number {
  return manifestCounts(plan).reduce((total, [, count]) => total + count, 0);
}

function planChangeTotal(plan: AccountDeploymentPlan): number {
  const resourceChanges = diffTotals(plan).reduce(
    (total, [, diff]) =>
      total +
      Number(diff.added ?? 0) +
      Number(diff.changed ?? 0) +
      Number(diff.removed ?? 0),
    0,
  );
  return resourceChanges + (accountMetadataChanged(planAccountChange(plan)) ? 1 : 0);
}

function planDangerousTotal(plan: AccountDeploymentPlan): number {
  return plan.review?.diff?.dangerous?.length ?? 0;
}

function activeBaselineSummary(
  plan: AccountDeploymentPlan,
  active: AccountDeploymentState | null | undefined,
): string {
  if (active === undefined) return "loading active";
  if (active === null || active.artifactDigest === undefined) return "no active deployment";
  if (active.artifactDigest === plan.artifactDigest) return "matches active";
  return "will replace active";
}

function deploymentPlanStaleness(
  plan: AccountDeploymentPlan,
  active: AccountDeploymentState | null | undefined,
): { stale: boolean | null; message: string } {
  if (active === undefined) return { stale: null, message: "loading active deployment" };
  const currentDigest = active?.artifactDigest;
  const baselineDigest = plan.baselineArtifactDigest;
  const matches =
    baselineDigest === undefined
      ? currentDigest === undefined
      : currentDigest === baselineDigest;
  if (matches) return { stale: false, message: "matches active baseline" };
  return {
    stale: true,
    message: baselineDigest === undefined
      ? `tenant now has active artifact ${currentDigest ?? "none"}`
      : `expected active artifact ${baselineDigest}, found ${currentDigest ?? "none"}`,
  };
}

function reviewSnapshotForPlan(
  plan: AccountDeploymentPlan,
  active: AccountDeploymentState | null | undefined,
): Record<string, unknown> {
  return {
    planId: plan._id,
    status: plan.status,
    sourceDigest: plan.sourceDigest,
    artifactDigest: plan.artifactDigest,
    empty: plan.empty,
    destructive: plan.destructive,
    draftId: plan.draftId,
    rollbackOfPlanId: plan.rollbackOfPlanId,
    baseline: {
      activePlanId: plan.baselineActivePlanId,
      artifactDigest: plan.baselineArtifactDigest,
      appliedAt: plan.baselineAppliedAt,
    },
    current: active === undefined || active === null
      ? active ?? null
      : {
          activePlanId: active.activePlanId,
          artifactDigest: active.artifactDigest,
          appliedAt: active.appliedAt,
        },
    staleness: deploymentPlanStaleness(plan, active),
    summary: plan.summary,
    review: plan.review ?? null,
  };
}

function reviewSnapshotText(
  plan: AccountDeploymentPlan,
  active: AccountDeploymentState | null | undefined,
): string {
  return JSON.stringify(reviewSnapshotForPlan(plan, active), null, 2);
}

function driftPlanSummary(plan: AccountConfigPlan | null | undefined): string {
  if (plan === undefined || plan === null) return "not available";
  if (!plan.valid) return `${plan.errors.length} validation error${plan.errors.length === 1 ? "" : "s"}`;
  const total =
    (accountMetadataChanged(plan.accountChange) ? 1 : 0) +
    Object.values(plan.byKind).reduce(
      (sum, diff) => sum + diff.added.length + diff.changed.length + diff.removed.length,
      0,
    );
  return `${total} dry-run change${total === 1 ? "" : "s"}`;
}

function AccountDeploymentReviewSummary({
  active,
  plan,
  sourceDiff,
  sourceDiffReview,
  drift,
}: {
  active: AccountDeploymentState | null | undefined;
  plan: AccountDeploymentPlan;
  sourceDiff?: AccountConfigSourceLineDiff | null;
  sourceDiffReview?: AccountConfigSourceDiffReview;
  drift?: AccountDeploymentDriftReview;
}) {
  const dangerous = planDangerousTotal(plan);
  const changes = planChangeTotal(plan);
  const graphEdgeCount =
    plan.review?.resourceGraph?.edgeCount ?? graphEdges(plan).length;
  return (
    <div className="rounded-md border border-line bg-canvas p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <div className="text-[12px] font-semibold text-ink">
            Review artifact
          </div>
          <div className="mt-0.5 text-[12px] text-muted">
            {deploymentSummary(plan)}
          </div>
        </div>
        <Chip tone={deploymentTone(plan.status)}>{plan.status}</Chip>
      </div>
      <div className="grid gap-2 text-[12px] text-muted md:grid-cols-2">
        <div>
          Source{" "}
          <Mono>
            {plan.review?.source?.format ?? "source"}:{plan.sourceDigest}
          </Mono>
        </div>
        <div>
          Artifact <Mono>{plan.artifactDigest}</Mono>
        </div>
        <div>
          Active baseline <Mono>{activeBaselineSummary(plan, active)}</Mono>
        </div>
        <div>
          Graph{" "}
          <Mono>
            {graphEdgeCount}
            {plan.review?.resourceGraph?.truncated ? "+" : ""} edges
          </Mono>
        </div>
        <div>
          Manifest <Mono>{planManifestTotal(plan)} resources</Mono>
        </div>
        <div>
          Semantic diff <Mono>{changes} changes</Mono>
        </div>
        <div>
          Dangerous changes <Mono>{dangerous}</Mono>
        </div>
        <div>
          Drift dry run <Mono>{driftPlanSummary(drift?.plan)}</Mono>
        </div>
        {plan.review?.source?.draft?.checkedInPath !== undefined && (
          <div className="md:col-span-2">
            Checked in <Mono>{plan.review.source.draft.checkedInPath}</Mono>
          </div>
        )}
        {draftCheckedInStatus(plan) !== undefined && (
          <div>
            Draft source <Mono>{draftCheckedInStatus(plan)}</Mono>
          </div>
        )}
        {drift?.draft !== undefined && drift.draft !== null && (
          <div>
            Draft drift <Mono>{drift.draft.artifactDigest}</Mono>
          </div>
        )}
        {drift?.live !== undefined && drift.live !== null && (
          <div>
            Live mirror <Mono>{drift.live.artifactDigest}</Mono>
          </div>
        )}
      </div>
      {dangerous > 0 && (
        <ul className="mt-3 space-y-1 rounded-md border border-amber-200 bg-amber-50 p-2 text-[12px] text-amber-800">
          {plan.review?.diff?.dangerous?.slice(0, 3).map((item) => (
            <li key={`${item.kind}:${item.value}`}>
              {item.kind}:{item.value} - {item.reason}
            </li>
          ))}
        </ul>
      )}
      {sourceDiff !== undefined && (
        <AccountConfigSourceDiffPanel diff={sourceDiff} review={sourceDiffReview} />
      )}
    </div>
  );
}

export function AccountDeploymentPanel({
  active,
  plans,
  sourceDiff,
  sourceDiffReview,
  drift,
  busy,
  onApprovePlan,
  onApplyPlan,
  onRollbackPlan,
}: {
  active: AccountDeploymentState | null | undefined;
  plans: AccountDeploymentPlan[] | undefined;
  sourceDiff?: AccountConfigSourceLineDiff | null;
  sourceDiffReview?: AccountConfigSourceDiffReview;
  drift?: AccountDeploymentDriftReview;
  busy: boolean;
  onApprovePlan: (planId: string) => void;
  onApplyPlan: (planId: string) => void;
  onRollbackPlan: (planId: string) => void;
}) {
  const reviewPlan = deploymentReviewCandidate(plans);
  return (
    <Card>
      <CardHeader title="Deployment" hint="plan / apply" />
      <div className="space-y-4 p-5">
        {active === undefined ? (
          <p className="text-[13px] text-muted">Loading active deployment...</p>
        ) : active === null ? (
          <div className="rounded-md border border-line p-3">
            <div className="text-[12px] font-semibold text-ink">
              No active deployment
            </div>
            <p className="mt-1 text-[12px] text-muted">
              Create a deployment plan from the draft source, then apply it.
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-line p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[12px] font-semibold text-ink">
                Active deployment
              </span>
              {active.plan && (
                <Chip tone={deploymentTone(active.plan.status)}>
                  {active.plan.status}
                </Chip>
              )}
            </div>
            <div className="grid gap-2 text-[12px] text-muted md:grid-cols-2">
              <div>
                Source <Mono>{active.sourceDigest ?? "unknown"}</Mono>
              </div>
              <div>
                Artifact <Mono>{active.artifactDigest ?? "unknown"}</Mono>
              </div>
              <div>
                Applied by <Mono>{active.appliedBy ?? "unknown"}</Mono>
              </div>
              <div>
                {active.appliedAt === undefined
                  ? "Apply time unknown"
                  : new Date(active.appliedAt).toLocaleString()}
              </div>
            </div>
          </div>
        )}

        {plans === undefined ? (
          <p className="text-[13px] text-muted">Loading deployment plans...</p>
        ) : plans.length === 0 ? (
          <p className="text-[13px] text-muted">No deployment plans yet.</p>
        ) : (
          <ul className="divide-y divide-line-soft rounded-md border border-line">
            {reviewPlan !== undefined && (
              <li className="border-b border-line-soft p-3">
            <AccountDeploymentReviewSummary
              active={active}
              plan={reviewPlan}
              sourceDiff={sourceDiff}
              sourceDiffReview={sourceDiffReview}
              drift={drift}
            />
              </li>
            )}
            {plans.map((plan) => {
              const staleness = deploymentPlanStaleness(plan, active);
              const deployActionBlocked =
                staleness.stale === true &&
                (plan.status === "planned" || plan.status === "approved");
              return (
              <li key={plan._id} className="space-y-2 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Chip tone={deploymentTone(plan.status)}>
                      {plan.status}
                    </Chip>
                    <span className="text-[12px] text-muted">
                      {deploymentSummary(plan)}
                    </span>
                  </div>
                  <Mono>{new Date(plan.updatedAt).toLocaleString()}</Mono>
                </div>
                <div className="grid gap-1 text-[12px] text-muted md:grid-cols-2">
                  <div>
                    Source{" "}
                    <Mono>
                      {plan.review?.source?.format ?? "source"}:{plan.sourceDigest}
                    </Mono>
                  </div>
                  <div>
                    Artifact <Mono>{plan.artifactDigest}</Mono>
                  </div>
                  {plan.approvedBy !== undefined && (
                    <div>
                      Approved by <Mono>{plan.approvedBy}</Mono>
                    </div>
                  )}
                  {plan.rollbackOfPlanId !== undefined && (
                    <div>
                      Rollback of <Mono>{plan.rollbackOfPlanId}</Mono>
                    </div>
                  )}
                  {plan.review?.source?.draft !== undefined && (
                    <div>
                      Draft{" "}
                      <Mono>
                        {plan.review.source.draft.name ?? plan.review.source.draft.id ?? "unknown"}
                      </Mono>
                    </div>
                  )}
                  {plan.review?.rollbackTarget?.appliedAt !== undefined && (
                    <div>
                      Restores{" "}
                      <Mono>
                        {new Date(plan.review.rollbackTarget.appliedAt).toLocaleString()}
                      </Mono>
                    </div>
                  )}
                </div>
                <AccountDeploymentReviewSnapshot active={active} plan={plan} />
                {plan.review?.rollbackTarget !== undefined && (
                  <div className="rounded-md border border-blue/30 bg-blue-soft p-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-blue-ink">
                      Rollback target
                    </div>
                    <div className="mt-1 grid gap-1 text-[12px] text-blue-ink md:grid-cols-2">
                      <div>
                        Plan <Mono>{plan.review.rollbackTarget.planId ?? "unknown"}</Mono>
                      </div>
                      <div>
                        Source{" "}
                        <Mono>{plan.review.rollbackTarget.sourceDigest ?? "unknown"}</Mono>
                      </div>
                      <div>
                        Artifact{" "}
                        <Mono>{plan.review.rollbackTarget.artifactDigest ?? "unknown"}</Mono>
                      </div>
                      <div>
                        Applied{" "}
                        <Mono>
                          {plan.review.rollbackTarget.appliedAt === undefined
                            ? "unknown"
                            : new Date(plan.review.rollbackTarget.appliedAt).toLocaleString()}
                        </Mono>
                      </div>
                    </div>
                  </div>
                )}
                {plan.review?.source?.draft !== undefined && (
                  <div className="rounded-md border border-line-soft p-2">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                      Draft review
                    </div>
                    <div className="grid gap-1 text-[12px] text-muted md:grid-cols-2">
                      <div>
                        Source <Mono>{plan.review.source.draft.sourceDigest ?? "unknown"}</Mono>
                      </div>
                      {plan.review.source.draft.checkedInPath !== undefined && (
                        <div>
                          Checked in <Mono>{plan.review.source.draft.checkedInPath}</Mono>
                        </div>
                      )}
                      {draftCheckedInStatus(plan) !== undefined && (
                        <div>
                          Draft source <Mono>{draftCheckedInStatus(plan)}</Mono>
                        </div>
                      )}
                      {plan.review.source.draft.updatedBy !== undefined && (
                        <div>
                          Saved by <Mono>{plan.review.source.draft.updatedBy}</Mono>
                        </div>
                      )}
                    </div>
                    {plan.review.source.draft.reviewNote !== undefined && (
                      <p className="mt-2 text-[12px] text-ink">
                        {plan.review.source.draft.reviewNote}
                      </p>
                    )}
                  </div>
                )}
                {(diffTotals(plan).length > 0 || accountMetadataChanged(planAccountChange(plan))) && (
                  <div className="rounded-md border border-line-soft p-2">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                      Semantic diff
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {accountMetadataChanged(planAccountChange(plan)) && planAccountChange(plan) !== undefined && (
                        <Chip tone="data">
                          {accountChangeSummary(planAccountChange(plan)!)}
                        </Chip>
                      )}
                      {diffTotals(plan).map(([kind, totals]) => {
                        const totalChanges =
                          Number(totals.added ?? 0) +
                          Number(totals.changed ?? 0) +
                          Number(totals.removed ?? 0);
                        return (
                          <Chip
                            key={kind}
                            tone={totalChanges > 0 ? "data" : "system"}
                          >
                            {kind} +{totals.added ?? 0} / ~
                            {totals.changed ?? 0} / -{totals.removed ?? 0}
                          </Chip>
                        );
                      })}
                    </div>
                  </div>
                )}
                {manifestCounts(plan).length > 0 && (
                  <div className="rounded-md border border-line-soft p-2">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                      Artifact manifest
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {manifestCounts(plan).map(([kind, count]) => (
                        <Chip key={kind} tone={count > 0 ? "configured" : "system"}>
                          {kind} {count}
                        </Chip>
                      ))}
                    </div>
                  </div>
                )}
                {plan.review?.resourceGraph !== undefined && (
                  <div className="rounded-md border border-line-soft p-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                        Resource graph
                      </span>
                      <span className="tnum text-[11px] text-muted">
                        {plan.review.resourceGraph.edgeCount ?? graphEdges(plan).length}
                        {plan.review.resourceGraph.truncated ? "+" : ""} edges
                      </span>
                    </div>
                    <div className="mb-2 text-[12px] text-muted">
                      Graph <Mono>{plan.review.resourceGraph.digest ?? "unknown"}</Mono>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {graphEdges(plan).slice(0, 8).map((edge) => (
                        <Chip
                          key={`${edge.fromKind}:${edge.fromName}:${edge.relation}:${edge.toKind}:${edge.toName}`}
                          tone="neutral"
                        >
                          {edge.fromName} {edge.relation} {edge.toName}
                        </Chip>
                      ))}
                      {graphEdges(plan).length === 0 && (
                        <span className="text-[12px] text-muted">No graph edges</span>
                      )}
                    </div>
                  </div>
                )}
                {(plan.review?.diff?.dangerous?.length ?? 0) > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-900">
                      Dangerous changes
                    </div>
                    <ul className="mt-1 space-y-1 text-[12px] text-amber-800">
                      {plan.review?.diff?.dangerous?.map((item) => (
                        <li key={`${item.kind}:${item.value}`}>
                          {item.kind}:{item.value} - {item.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {hasPayloadPreview(plan) && (
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="min-w-0 rounded-md border border-line-soft p-2">
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                        Source payload
                      </div>
                      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-canvas p-2 font-mono text-[11px] text-ink-2">
                        {plan.review?.source?.preview ?? "No source preview"}
                      </pre>
                    </div>
                    <div className="min-w-0 rounded-md border border-line-soft p-2">
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                        Artifact payload
                      </div>
                      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-canvas p-2 font-mono text-[11px] text-ink-2">
                        {plan.review?.artifact?.preview ?? "No artifact preview"}
                      </pre>
                    </div>
                  </div>
                )}
                {plan.error !== undefined && (
                  <pre className="whitespace-pre-wrap rounded-md bg-red-soft p-2 text-[12px] text-red-ink">
                    {plan.error}
                  </pre>
                )}
                {deployActionBlocked && (
                  <div className="rounded-md border border-orange/30 bg-orange-soft p-2 text-[12px] text-orange-ink">
                    Active deployment changed after this plan was reviewed. Create
                    a new deployment plan before approving or applying.
                  </div>
                )}
                {plan.status === "planned" && (
                  <Button
                    variant="outline"
                    disabled={busy || deployActionBlocked}
                    onClick={() => onApprovePlan(plan._id)}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {isRollbackPlan(plan) ? "Approve Rollback" : "Approve Plan"}
                  </Button>
                )}
                {plan.status === "approved" && (
                  <Button
                    variant="primary"
                    disabled={busy || deployActionBlocked}
                    onClick={() => onApplyPlan(plan._id)}
                  >
                    <Play className="h-3.5 w-3.5" />
                    {isRollbackPlan(plan) ? "Apply Rollback" : "Apply Plan"}
                  </Button>
                )}
                {plan.status === "applied" && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => onRollbackPlan(plan._id)}
                  >
                    <GitCompare className="h-3.5 w-3.5" />
                    Plan Rollback
                  </Button>
                )}
              </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-center gap-2 text-[12px] text-muted">
          <GitCompare className="h-3.5 w-3.5" />
          Draft changes are reviewed as persisted deployment plans before apply.
        </div>
      </div>
    </Card>
  );
}
