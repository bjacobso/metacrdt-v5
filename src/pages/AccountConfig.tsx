import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  Download,
  GitCompare,
  LocateFixed,
  Maximize2,
  Minimize2,
  Play,
  Save,
  Upload,
  Wand2,
} from "lucide-react";
import { dumpAccountDeploy } from "@metacrdt/account-config";
import { useTenant } from "../tenant";
import { Button, Card, CardHeader, Chip, Input, Mono } from "../ui";
import { useWriteGate } from "../auth";
import {
  AccountConfigSourceEditor,
  type AccountConfigSourceEditorHandle,
} from "../AccountConfigSourceEditor";
import {
  AccountConfigCompletionPanel,
  AccountDeploymentPanel,
  AccountConfigPlanPanel,
  AccountConfigResourceGraphPanel,
  AccountConfigSourceDiagnosticsPanel,
  AccountConfigWorkflowPanel,
  AccountConfigDriftPanel,
  AccountConfigHistoryPanel,
  AccountConfigDraftReviewPanel,
  AccountConfigSavedDraftSelector,
  AccountConfigCheckedInSourceSelector,
  type AccountDeploymentPlan,
  type AccountDeploymentState,
  type AccountConfigDriftSnapshot,
  type AccountConfigPlan,
  type AccountConfigWorkflowReview,
  type AccountConfigHistoryFilter,
  type AccountConfigHistoryTransaction,
  type ConfigKind,
} from "../accountConfigView";
import {
  COMPACT_FORMA_SNIPPETS,
  type AccountConfigSourceFormat,
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
} from "../configSource";
import {
  checkedInSourcesForTenant as accountSourcesForTenant,
  selectCheckedInAccountSource,
} from "../accountConfigSources";

const DEFAULT_CONFIG = JSON.stringify(
  {
    account: {
      slug: "legal-workflows",
      name: "Legal Workflows",
      kind: "legal",
    },
    attributes: [
      {
        name: "matter.status",
        valueType: "string",
        cardinality: "one",
        description: "Current matter lifecycle state.",
      },
      {
        name: "client",
        valueType: "entityRef",
        cardinality: "one",
        description: "Client associated with the matter.",
      },
    ],
    entityTypes: [
      {
        name: "Matter",
        attributes: ["name", "matter.status"],
        description: "A legal matter.",
      },
    ],
    forms: [
      {
        form: "conflict_check",
        title: "Conflict Check",
        fields: [
          {
            name: "cleared",
            label: "Conflict cleared",
            type: "boolean",
            required: true,
          },
        ],
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
        label: "Close matter",
        appliesTo: "Matter",
        asserts: { "matter.status": "closed" },
      },
    ],
  },
  null,
  2,
);

type AccountConfigDraft = {
  _id: string;
  name: string;
  source: string;
  sourceFormat: AccountConfigSourceFormat;
  sourceDigest: string;
  checkedInPath?: string;
  checkedInDigest?: string;
  reviewNote?: string;
  artifactDigest?: string;
  diagnostics: {
    message: string;
    loc?: { line: number; col: number };
    path?: string;
  }[];
  validation?: {
    valid: boolean;
    errors: string[];
  };
  updatedAt: number;
  updatedBy: string;
};

export default function AccountConfig() {
  const {
    selectedTenant,
    selectedTenantSlug,
    tenants,
    ensureDemoTenant,
    ensureDemoTenants,
  } = useTenant();
  const [source, setSource] = useState(DEFAULT_CONFIG);
  const [draftOpen, setDraftOpen] = useState(false);
  const [activeSourceFormat, setActiveSourceFormat] =
    useState<AccountConfigSourceFormat>("forma");
  const [draftName, setDraftName] = useState("main");
  const [selectedDraftId, setSelectedDraftId] = useState("");
  const [selectedCheckedInPath, setSelectedCheckedInPath] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] =
    useState<AccountConfigHistoryFilter>("changes");
  const [busy, setBusy] = useState(false);
  const [completionIndex, setCompletionIndex] = useState(0);
  const [outlineExpanded, setOutlineExpanded] = useState(false);
  const [selectedNavigationKey, setSelectedNavigationKey] = useState("");
  const sourceEditorRef = useRef<AccountConfigSourceEditorHandle | null>(null);
  const { guardWrite, isAuthenticated } = useWriteGate();
  const planDeployment = useMutation(api.accountDeploy.planFromArtifact);
  const approveDeployment = useMutation(api.accountDeploy.approvePlan);
  const applyDeployment = useMutation(api.accountDeploy.applyPlan);
  const planRollback = useMutation(api.accountDeploy.planRollback);
  const saveConfigDraft = useMutation(api.accountConfigDrafts.saveDraft);
  const deleteConfigDraft = useMutation(api.accountConfigDrafts.deleteDraft);

  const draftParsed = useMemo(() => parseAccountConfigSource(source), [source]);
  const manifest = useQuery(
    api.configHistory.currentManifest,
    selectedTenantSlug ? { tenantSlug: selectedTenantSlug } : "skip",
  );
  const history = useQuery(
    api.configHistory.history,
    selectedTenantSlug
      ? {
          tenantSlug: selectedTenantSlug,
          limit: 8,
          ...(historyFilter === "changes" ? { changesOnly: true } : {}),
          ...(historyFilter !== "all" && historyFilter !== "changes"
            ? { changedKind: historyFilter as ConfigKind }
            : {}),
        }
      : "skip",
  );
  const exported = useQuery(
    api.appconfig.exportConfig,
    selectedTenantSlug ? { tenantSlug: selectedTenantSlug } : "skip",
  );
  const activeSource = useMemo(() => {
    if (exported === undefined) return null;
    const { warnings: _warnings, ...config } = exported;
    return formatAccountConfigSource(config, activeSourceFormat);
  }, [activeSourceFormat, exported]);
  const displaySource = draftOpen ? source : activeSource ?? source;
  const parsed = useMemo(
    () => parseAccountConfigSource(displaySource),
    [displaySource],
  );
  const activeDeployment = useQuery(
    api.accountDeploy.currentDeployment,
    selectedTenantSlug ? { tenantSlug: selectedTenantSlug } : "skip",
  );
  const deploymentPlans = useQuery(
    api.accountDeploy.listPlans,
    selectedTenantSlug ? { tenantSlug: selectedTenantSlug, limit: 5 } : "skip",
  );
  const savedDrafts = useQuery(
    api.accountConfigDrafts.listDrafts,
    selectedTenantSlug ? { tenantSlug: selectedTenantSlug, limit: 8 } : "skip",
  );
  const plan = useQuery(
    api.appconfig.planConfig,
    selectedTenantSlug && draftOpen && draftParsed.config !== null
      ? { tenantSlug: selectedTenantSlug, config: draftParsed.config }
      : "skip",
  );
  const typedActiveDeployment = activeDeployment as
    | AccountDeploymentState
    | null
    | undefined;
  const typedDeploymentPlans = deploymentPlans as AccountDeploymentPlan[] | undefined;
  const typedSavedDrafts = savedDrafts as AccountConfigDraft[] | undefined;
  const typedHistory = history as AccountConfigHistoryTransaction[] | undefined;
  const typedPlan = plan as AccountConfigPlan | undefined;
  const draftDeployDump = useMemo(() => {
    if (!draftOpen || draftParsed.config === null) return null;
    return dumpAccountDeploy(draftParsed.config);
  }, [draftOpen, draftParsed.config]);
  const tenantCompatibilityError = useMemo(() => {
    if (
      !draftOpen ||
      selectedTenantSlug == null ||
      draftDeployDump === null
    ) {
      return null;
    }
    const accountSlug = draftDeployDump.source.account.slug;
    return accountSlug === selectedTenantSlug
      ? null
      : `Draft account slug ${accountSlug} does not match selected tenant ${selectedTenantSlug}`;
  }, [draftDeployDump, draftOpen, selectedTenantSlug]);
  const draftDrift = useMemo<AccountConfigDriftSnapshot | null>(() => {
    if (draftDeployDump === null) return null;
    return {
      sourceDigest: draftDeployDump.source.digest,
      artifactDigest: draftDeployDump.prepared.digest,
      manifest: draftDeployDump.source.manifest,
      diagnostics: [
        ...draftDeployDump.source.diagnostics,
        ...(tenantCompatibilityError === null ? [] : [tenantCompatibilityError]),
      ],
    };
  }, [draftDeployDump, tenantCompatibilityError]);
  const liveDrift = useMemo<AccountConfigDriftSnapshot | null | undefined>(() => {
    if (exported === undefined) return undefined;
    const { warnings, ...config } = exported;
    const dump = dumpAccountDeploy(config);
    return {
      sourceDigest: dump.source.digest,
      artifactDigest: dump.prepared.digest,
      manifest: dump.source.manifest,
      diagnostics: [...dump.source.diagnostics, ...warnings],
    };
  }, [exported]);
  const sourceOutline = useMemo(
    () =>
      parsed.config === null
        ? []
        : accountConfigSourceOutline(parsed.config, displaySource),
    [displaySource, parsed.config],
  );
  const sourceGraph = useMemo(
    () => (parsed.config === null ? [] : accountConfigResourceGraph(parsed.config)),
    [parsed.config],
  );
  const sourceGraphMermaid = useMemo(
    () =>
      parsed.config === null
        ? ""
        : accountConfigResourceGraphMermaid(parsed.config, sourceGraph),
    [parsed.config, sourceGraph],
  );
  const navigationItems = useMemo(
    () => accountConfigSourceNavigationItems(sourceOutline, displaySource),
    [displaySource, sourceOutline],
  );
  const normalizedDraftSource = useMemo(() => {
    if (!draftOpen || draftParsed.config === null || draftParsed.format === null) {
      return null;
    }
    return formatAccountConfigSource(draftParsed.config, draftParsed.format);
  }, [draftOpen, draftParsed.config, draftParsed.format]);
  const normalizedDraftDiff = useMemo(
    () =>
      normalizedDraftSource === null
        ? null
        : accountConfigSourceLineDiff(source, normalizedDraftSource, 120),
    [normalizedDraftSource, source],
  );
  const completionSuggestions = useMemo(
    () => (parsed.config === null ? [] : formaCompletionSuggestions(parsed.config)),
    [parsed.config],
  );
  const selectedNavigationItem = useMemo(
    () => navigationItems.find((entry) => entry.key === selectedNavigationKey),
    [navigationItems, selectedNavigationKey],
  );
  const selectedSavedDraft = useMemo(
    () => typedSavedDrafts?.find((entry) => entry._id === selectedDraftId),
    [selectedDraftId, typedSavedDrafts],
  );
  const checkedInSourcesForTenant = useMemo(
    () => accountSourcesForTenant(selectedTenantSlug),
    [selectedTenantSlug],
  );
  const selectedCheckedInSource = useMemo(() => {
    return selectCheckedInAccountSource(
      checkedInSourcesForTenant,
      selectedCheckedInPath,
    );
  }, [checkedInSourcesForTenant, selectedCheckedInPath]);
  const selectedCheckedInDigest = selectedCheckedInSource === undefined
    ? null
    : accountConfigSourceTextDigest(selectedCheckedInSource.source);
  const currentDraftTextDigest = accountConfigSourceTextDigest(source);
  const workflowReview = useMemo<AccountConfigWorkflowReview>(() => ({
    checkedInPath: selectedCheckedInSource?.path ?? null,
    checkedInDigest: selectedCheckedInDigest,
    draftDigest: draftOpen ? currentDraftTextDigest : null,
    normalized:
      normalizedDraftSource === null ? null : source === normalizedDraftSource,
    normalizedDigest:
      normalizedDraftSource === null
        ? null
        : accountConfigSourceTextDigest(normalizedDraftSource),
    graphEdgeCount: sourceGraph.length,
    navigationCount: navigationItems.length,
  }), [
    currentDraftTextDigest,
    draftOpen,
    navigationItems.length,
    normalizedDraftSource,
    selectedCheckedInDigest,
    selectedCheckedInSource?.path,
    source,
    sourceGraph.length,
  ]);

  function sourceDiagnostics() {
    return [
      ...(draftParsed.error === null
        ? []
        : [{ message: draftParsed.error }]),
      ...draftParsed.diagnostics.map((diagnostic) => ({
        message: diagnostic.message,
        ...(diagnostic.loc === undefined ? {} : { loc: diagnostic.loc }),
        ...(diagnostic.path === undefined ? {} : { path: diagnostic.path }),
      })),
    ];
  }

  function currentDraftSourceFormat(): AccountConfigSourceFormat {
    if (draftParsed.format !== null) return draftParsed.format;
    const trimmed = source.trimStart();
    if (trimmed.startsWith("(")) return "forma";
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
    return "yaml";
  }

  async function createDeploymentPlan() {
    if (
      !draftOpen ||
      !selectedTenantSlug ||
      draftParsed.config === null ||
      draftDeployDump === null ||
      tenantCompatibilityError !== null
    ) {
      return;
    }
    setBusy(true);
    try {
      const matchingSavedDraft =
        selectedSavedDraft !== undefined &&
        selectedSavedDraft.sourceDigest === currentDraftTextDigest &&
        (selectedSavedDraft.artifactDigest === undefined ||
          selectedSavedDraft.artifactDigest === draftDeployDump.prepared.digest)
          ? selectedSavedDraft
          : undefined;
      await guardWrite("Create deployment plan", () =>
        planDeployment({
          tenantSlug: selectedTenantSlug,
          config: draftParsed.config,
          artifact: draftDeployDump.prepared.artifact,
          sourceDigest: draftDeployDump.source.digest,
          artifactDigest: draftDeployDump.prepared.digest,
          sourceFormat: draftParsed.format ?? undefined,
          ...(matchingSavedDraft === undefined
            ? {}
            : {
                draftId: matchingSavedDraft._id as Id<"accountConfigDrafts">,
                draftSourceDigest: matchingSavedDraft.sourceDigest,
              }),
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveCurrentDraft() {
    if (!draftOpen || !selectedTenantSlug || source.trim() === "") return;
    const deployDump =
      draftParsed.config === null ? null : dumpAccountDeploy(draftParsed.config);
    setBusy(true);
    setDraftNotice(null);
    try {
      const result = await guardWrite("Save account config draft", () =>
        saveConfigDraft({
          tenantSlug: selectedTenantSlug,
          name: draftName,
          source,
          sourceFormat: currentDraftSourceFormat(),
          ...(draftParsed.config === null ? {} : { config: draftParsed.config }),
          ...(deployDump === null
            ? {}
            : { artifactDigest: deployDump.prepared.digest }),
          ...(selectedCheckedInSource === undefined
            ? {}
            : {
                checkedInPath: selectedCheckedInSource.path,
                checkedInDigest: selectedCheckedInDigest ?? undefined,
              }),
          ...(reviewNote.trim() === "" ? {} : { reviewNote }),
          diagnostics: sourceDiagnostics(),
        }),
      );
      if (result === undefined) return;
      setSelectedDraftId(String(result.draftId));
      setDraftNotice(
        result.validation?.valid === false
          ? `Saved with ${result.validation.errors.length} validation issue${
              result.validation.errors.length === 1 ? "" : "s"
            }`
          : "Draft saved",
      );
    } finally {
      setBusy(false);
    }
  }

  function loadSavedDraft() {
    if (selectedSavedDraft === undefined) return;
    setSource(selectedSavedDraft.source);
    setDraftOpen(true);
    setDraftName(selectedSavedDraft.name);
    setSelectedCheckedInPath(selectedSavedDraft.checkedInPath ?? "");
    setReviewNote(selectedSavedDraft.reviewNote ?? "");
    setDraftNotice(`Loaded ${selectedSavedDraft.name}`);
  }

  function loadCheckedInSource() {
    if (selectedCheckedInSource === undefined) return;
    setSource(selectedCheckedInSource.source);
    setDraftOpen(true);
    setDraftName(selectedCheckedInSource.tenantSlug);
    setSelectedCheckedInPath(selectedCheckedInSource.path);
    setDraftNotice(`Loaded ${selectedCheckedInSource.path}`);
  }

  async function deleteSelectedDraft() {
    if (selectedTenantSlug === null || selectedSavedDraft === undefined) return;
    setBusy(true);
    setDraftNotice(null);
    try {
      await guardWrite("Delete account config draft", () =>
        deleteConfigDraft({
          tenantSlug: selectedTenantSlug,
          draftId: selectedSavedDraft._id as Id<"accountConfigDrafts">,
        }),
      );
      setSelectedDraftId("");
      setDraftNotice("Draft deleted");
    } finally {
      setBusy(false);
    }
  }

  async function applyDeploymentPlan(planId: string) {
    if (!selectedTenantSlug) return;
    setBusy(true);
    try {
      await guardWrite("Apply deployment plan", () =>
        applyDeployment({
          tenantSlug: selectedTenantSlug,
          planId: planId as Id<"accountDeploymentPlans">,
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  async function approveDeploymentPlan(planId: string) {
    if (!selectedTenantSlug) return;
    setBusy(true);
    try {
      await guardWrite("Approve deployment plan", () =>
        approveDeployment({
          tenantSlug: selectedTenantSlug,
          planId: planId as Id<"accountDeploymentPlans">,
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  async function createRollbackPlan(planId: string) {
    if (!selectedTenantSlug) return;
    setBusy(true);
    try {
      await guardWrite("Plan deployment rollback", () =>
        planRollback({
          tenantSlug: selectedTenantSlug,
          planId: planId as Id<"accountDeploymentPlans">,
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  function loadExportedSource() {
    if (exported === undefined) return;
    const { warnings: _warnings, ...config } = exported;
    setSource(formatAccountConfigSource(config, "json"));
    setDraftOpen(true);
  }

  function setSourceFormat(format: AccountConfigSourceFormat) {
    if (!draftOpen) {
      setActiveSourceFormat(format);
      return;
    }
    if (draftParsed.config === null) return;
    setSource(formatAccountConfigSource(draftParsed.config, format));
  }

  function normalizeSourceDraft() {
    if (!draftOpen || draftParsed.config === null || draftParsed.format === null) {
      return;
    }
    setSource(formatAccountConfigSource(draftParsed.config, draftParsed.format));
  }

  function loadExportedSourceAs(format: AccountConfigSourceFormat) {
    if (exported === undefined) return;
    const { warnings: _warnings, ...config } = exported;
    setSource(formatAccountConfigSource(config, format));
    setDraftOpen(true);
  }

  function loadCompactFormaStarter() {
    setSource(
      compactFormaStarter({
        slug: selectedTenant?.slug,
        name: selectedTenant?.name,
        kind: selectedTenant?.kind,
      }),
    );
    setDraftOpen(true);
  }

  function startDraftFromActive() {
    setSource(activeSource ?? source);
    setDraftOpen(true);
  }

  function discardDraft() {
    setDraftOpen(false);
  }

  function insertFormaSnippet(snippet: string) {
    if (!draftOpen) return;
    const editor = sourceEditorRef.current;
    if (editor === null) {
      setSource((current) => `${current.trimEnd()}\n${snippet}`);
      return;
    }
    editor.insertText(snippet);
  }

  function insertSelectedCompletion() {
    const suggestion =
      completionSuggestions[
        Math.min(completionIndex, Math.max(0, completionSuggestions.length - 1))
      ];
    if (suggestion === undefined) return;
    insertFormaSnippet(suggestion.source);
  }

  function focusDiagnostic(line: number) {
    sourceEditorRef.current?.focusLine(line);
  }

  function jumpToSelectedResource() {
    if (selectedNavigationItem === undefined) return;
    focusDiagnostic(selectedNavigationItem.line);
  }

  if (tenants !== undefined && tenants.length === 0) {
    return (
      <Card>
        <CardHeader title="Account Config" hint="tenant configuration" />
        <div className="space-y-3 p-5">
          <p className="text-[14px] text-muted">
            No tenants are available for this signed-in principal.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={!isAuthenticated}
              onClick={() =>
                void guardWrite("Create staffing tenant", () =>
                  ensureDemoTenant("staffing"),
                )
              }
            >
              <Upload className="h-3.5 w-3.5" />
              Create staffing tenant
            </Button>
            <Button
              variant="outline"
              disabled={!isAuthenticated}
              onClick={() =>
                void guardWrite("Create legal tenant", () =>
                  ensureDemoTenant("legal"),
                )
              }
            >
              <Upload className="h-3.5 w-3.5" />
              Create legal tenant
            </Button>
            <Button
              variant="ghost"
              disabled={!isAuthenticated}
              onClick={() =>
                void guardWrite("Create demo tenants", () => ensureDemoTenants())
              }
            >
              <Upload className="h-3.5 w-3.5" />
              Create both
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          Account Config
        </p>
        <h2 className="mt-1 text-3xl font-semibold tracking-tight text-ink">
          {selectedTenant?.name ?? "Select a tenant"}
        </h2>
        <p className="mt-1 max-w-2xl text-[14px] text-muted">
          Active Forma source, editable drafts, deployment review, and tenant
          runtime state.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <Card>
          <CardHeader
            title={draftOpen ? "Draft Forma Definition" : "Current Forma Definition"}
            hint={
              parsed.format === null
                ? "account config"
                : draftOpen
                  ? `${parsed.format.toUpperCase()} draft`
                  : `${parsed.format.toUpperCase()} active source`
            }
            right={
              <Chip tone={draftOpen ? "data" : "configured"}>
                {draftOpen ? "editable" : "active"}
              </Chip>
            }
          />
          <div className="space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-canvas p-3">
              <div className="min-w-0">
                <div className="text-[12px] font-semibold text-ink">
                  {draftOpen ? "Draft in progress" : "Active source"}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Chip tone={parsed.format === "forma" ? "configured" : "system"}>
                    {parsed.format?.toUpperCase() ?? "unparsed"}
                  </Chip>
                  {typedActiveDeployment?.artifactDigest !== undefined && (
                    <Chip tone="data">{typedActiveDeployment.artifactDigest}</Chip>
                  )}
                  {selectedSavedDraft !== undefined && (
                    <Chip tone="configured">saved {selectedSavedDraft.name}</Chip>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {draftOpen ? (
                  <>
                    <Button
                      variant="outline"
                      disabled={
                        busy ||
                        !selectedTenantSlug ||
                        source.trim() === ""
                      }
                      onClick={() => void saveCurrentDraft()}
                    >
                      <Save className="h-3.5 w-3.5" />
                      Save draft
                    </Button>
                    <Button variant="ghost" onClick={discardDraft}>
                      <Download className="h-3.5 w-3.5" />
                      Discard
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="primary"
                    disabled={!selectedTenantSlug}
                    onClick={startDraftFromActive}
                  >
                    <GitCompare className="h-3.5 w-3.5" />
                    Create editable draft
                  </Button>
                )}
                <Button
                  variant="outline"
                  disabled={exported === undefined}
                  onClick={() => loadExportedSourceAs("forma")}
                >
                  <Download className="h-3.5 w-3.5" />
                  Load active Forma
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {(["json", "yaml", "forma"] as const).map((format) => (
                  <Button
                    key={format}
                    variant={parsed.format === format ? "primary" : "outline"}
                    disabled={parsed.config === null}
                    onClick={() => setSourceFormat(format)}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {format.toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>
            {draftOpen && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-line-soft bg-canvas p-2">
                <Button
                  variant="outline"
                  disabled={
                    draftParsed.config === null ||
                    draftParsed.format === null
                  }
                  onClick={normalizeSourceDraft}
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  Normalize {draftParsed.format?.toUpperCase() ?? "source"}
                </Button>
                <Button
                  variant="ghost"
                  disabled={sourceOutline.length === 0}
                  onClick={() => setOutlineExpanded((value) => !value)}
                >
                  {outlineExpanded ? (
                    <Minimize2 className="h-3.5 w-3.5" />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" />
                  )}
                  {outlineExpanded ? "Compact outline" : "Expand outline"}
                </Button>
              </div>
            )}
            {draftOpen && (
              <div className="space-y-2 rounded-md border border-line-soft bg-canvas p-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] text-muted">Draft persistence</span>
                <Input
                  value={draftName}
                  disabled={!draftOpen}
                  onChange={(event) => setDraftName(event.currentTarget.value)}
                  aria-label="Draft name"
                  className="w-36"
                />
                <Button
                  variant="outline"
                  disabled={
                    busy ||
                    !draftOpen ||
                    !selectedTenantSlug ||
                    source.trim() === ""
                  }
                  onClick={() => void saveCurrentDraft()}
                >
                  <Save className="h-3.5 w-3.5" />
                  Save draft
                </Button>
                <AccountConfigSavedDraftSelector
                  drafts={typedSavedDrafts}
                  selectedDraftId={selectedDraftId}
                  busy={busy}
                  onSelectDraft={setSelectedDraftId}
                  onLoadDraft={loadSavedDraft}
                  onDeleteDraft={() => void deleteSelectedDraft()}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] text-muted">Checked-in source</span>
                <AccountConfigCheckedInSourceSelector
                  sources={checkedInSourcesForTenant}
                  selectedPath={selectedCheckedInPath}
                  draftOpen={draftOpen}
                  draftMatchesSelected={currentDraftTextDigest === selectedCheckedInDigest}
                  onSelectSource={setSelectedCheckedInPath}
                  onLoadSource={loadCheckedInSource}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] text-muted">Review note</span>
                <Input
                  value={reviewNote}
                  disabled={!draftOpen}
                  onChange={(event) => setReviewNote(event.currentTarget.value)}
                  aria-label="Review note"
                  placeholder="Change rationale"
                  className="min-w-0 flex-1"
                />
              </div>
              <AccountConfigDraftReviewPanel
                draft={selectedSavedDraft}
                notice={draftNotice}
              />
            </div>
            )}
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-line-soft bg-canvas p-2">
              <span className="text-[12px] text-muted">Jump</span>
              <select
                value={selectedNavigationKey}
                disabled={navigationItems.length === 0}
                onChange={(event) =>
                  setSelectedNavigationKey(event.currentTarget.value)
                }
                className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1.5 text-[12px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
              >
                <option value="">Select a source resource</option>
                {navigationItems.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                    {item.detail ? ` - ${item.detail}` : ""}
                    {item.sourceLine ? ` - ${item.sourceLine}` : ""}
                    {` - line ${item.line}`}
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                disabled={selectedNavigationItem === undefined}
                onClick={jumpToSelectedResource}
              >
                <LocateFixed className="h-3.5 w-3.5" />
                Go
              </Button>
            </div>
            {draftOpen && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-line-soft bg-canvas p-2">
                <Button variant="outline" onClick={loadCompactFormaStarter}>
                  <Upload className="h-3.5 w-3.5" />
                  New compact Forma draft
                </Button>
                {COMPACT_FORMA_SNIPPETS.map((snippet) => (
                  <Button
                    key={snippet.label}
                    variant="ghost"
                    disabled={parsed.format !== "forma"}
                    onClick={() => insertFormaSnippet(snippet.source)}
                  >
                    {snippet.label}
                  </Button>
                ))}
              </div>
            )}
            {draftOpen && (
              <AccountConfigCompletionPanel
                suggestions={completionSuggestions}
                selectedIndex={completionIndex}
                disabled={parsed.format !== "forma"}
                onSelectedIndexChange={setCompletionIndex}
                onInsert={insertSelectedCompletion}
              />
            )}
            <AccountConfigSourceEditor
              ref={sourceEditorRef}
              value={displaySource}
              format={parsed.format}
              onChange={setSource}
              readOnly={!draftOpen}
              rows={22}
            />
            {parsed.error && (
              <pre className="rounded-md bg-red-soft p-2 text-[12px] text-red-ink">
                {parsed.error}
              </pre>
            )}
            <AccountConfigSourceDiagnosticsPanel
              diagnostics={parsed.diagnostics}
              onFocusLine={focusDiagnostic}
            />
            {tenantCompatibilityError !== null && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-900">
                {tenantCompatibilityError}
              </div>
            )}
            {sourceOutline.length > 0 && (
              <div className="rounded-md border border-line-soft bg-surface p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[12px] font-semibold text-ink">
                    Source outline
                  </div>
                  <Chip tone="data">{parsed.format?.toUpperCase() ?? "IR"}</Chip>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {sourceOutline.map((group) => (
                    <div
                      key={group.kind}
                      className="min-w-0 rounded-md border border-line p-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                          {group.label}
                        </span>
                        <span className="tnum text-[11px] text-muted">
                          {group.items.length}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {group.items
                          .slice(0, outlineExpanded ? undefined : 4)
                          .map((item) =>
                            item.line === undefined ? (
                              <Chip key={`${group.kind}:${item.name}`} tone="system">
                                {item.name}
                                {item.detail ? ` · ${item.detail}` : ""}
                              </Chip>
                            ) : (
                              <button
                                key={`${group.kind}:${item.name}`}
                                type="button"
                                onClick={() => focusDiagnostic(item.line!)}
                                className="rounded-md border border-line bg-canvas px-2 py-1 text-left text-[12px] text-ink transition-colors hover:bg-line-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
                              >
                                <span className="font-medium">{item.name}</span>
                                {item.detail ? (
                                  <span className="text-muted"> · {item.detail}</span>
                                ) : null}
                              </button>
                            ),
                          )}
                        {group.items.length === 0 && (
                          <span className="text-[12px] text-muted">none</span>
                        )}
                        {!outlineExpanded && group.items.length > 4 && (
                          <span className="text-[12px] text-muted">
                            +{group.items.length - 4} more
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <AccountConfigResourceGraphPanel
                  edges={sourceGraph}
                  mermaid={sourceGraphMermaid}
                  expanded={outlineExpanded}
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="primary"
                disabled={
                  busy ||
                  !draftOpen ||
                  draftParsed.config === null ||
                  !selectedTenantSlug ||
                  plan?.valid === false ||
                  tenantCompatibilityError !== null
                }
                onClick={() => void createDeploymentPlan()}
              >
                <Play className="h-3.5 w-3.5" />
                {busy ? "Planning..." : "Create Deployment Plan"}
              </Button>
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <AccountConfigPlanPanel plan={typedPlan} />

          <AccountDeploymentPanel
            active={typedActiveDeployment}
            plans={typedDeploymentPlans}
            sourceDiff={normalizedDraftDiff}
            sourceDiffReview={{
              format: draftParsed.format,
              sourceDigest: workflowReview.draftDigest,
              normalizedDigest: workflowReview.normalizedDigest,
              checkedInPath: workflowReview.checkedInPath,
              checkedInDigest: workflowReview.checkedInDigest,
            }}
            drift={{
              draft: draftDrift,
              live: liveDrift,
              plan: typedPlan,
            }}
            busy={busy}
            onApprovePlan={(planId) => void approveDeploymentPlan(planId)}
            onApplyPlan={(planId) => void applyDeploymentPlan(planId)}
            onRollbackPlan={(planId) => void createRollbackPlan(planId)}
          />

          <AccountConfigDriftPanel
            draft={draftDrift}
            live={liveDrift}
            active={typedActiveDeployment}
            plan={typedPlan}
          />

          <AccountConfigHistoryPanel
            history={typedHistory}
            filter={historyFilter}
            onFilterChange={setHistoryFilter}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Manifest"
            hint={selectedTenantSlug ?? "no tenant selected"}
            right={
              selectedTenant ? (
                <Chip tone="configured">{selectedTenant.role}</Chip>
              ) : undefined
            }
          />
          {manifest === undefined ? (
            <p className="p-5 text-[13px] text-muted">Loading...</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-3">
              {(Object.entries(manifest) as [ConfigKind, string[]][]).map(
                ([kind, values]) => (
                  <div key={kind} className="rounded-md border border-line p-3">
                    <div className="text-[11px] uppercase tracking-wide text-muted">
                      {kind}
                    </div>
                    <div className="tnum mt-1 text-2xl font-semibold text-ink">
                      {values.length}
                    </div>
                    <div className="mt-1 truncate text-[12px] text-muted">
                      {values.slice(0, 2).join(", ") || "none"}
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </Card>

        <AccountConfigWorkflowPanel
          sourceFormat={draftOpen ? draftParsed.format : parsed.format}
          sourceReady={
            draftOpen &&
            draftParsed.config !== null &&
            plan?.valid !== false &&
            tenantCompatibilityError === null
          }
          diagnosticsCount={
            draftOpen
              ? draftParsed.diagnostics.length +
                (draftParsed.error ? 1 : 0) +
                (tenantCompatibilityError === null ? 0 : 1)
              : 0
          }
          review={workflowReview}
          plan={typedPlan}
          active={typedActiveDeployment}
          plans={typedDeploymentPlans}
        />
      </div>

      <Card>
        <CardHeader title="Export" hint="current tenant" />
        {exported === undefined ? (
          <p className="p-5 text-[13px] text-muted">Loading...</p>
        ) : (
          <div className="space-y-3 p-5">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
              {(
                [
                  ["attributes", exported.attributes.length],
                  ["types", exported.entityTypes.length],
                  ["forms", exported.forms.length],
                  ["flows", exported.flows.length],
                  ["requirements", exported.requirements.length],
                  ["actions", exported.actions.length],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="rounded-md border border-line p-2">
                  <div className="text-[11px] uppercase tracking-wide text-muted">
                    {label}
                  </div>
                  <div className="tnum text-lg font-semibold text-ink">
                    {value}
                  </div>
                </div>
              ))}
            </div>
            {exported.warnings.length > 0 && (
              <ul className="space-y-1 text-[12px] text-amber-700">
                {exported.warnings.map((warning: string) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              {(["json", "yaml", "forma"] as const).map((format) => (
                <Button
                  key={format}
                  variant="outline"
                  onClick={() => loadExportedSourceAs(format)}
                >
                  <Download className="h-3.5 w-3.5" />
                  Draft {format.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
