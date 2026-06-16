#!/usr/bin/env node
import { readdir, readFile, writeFile } from "node:fs/promises";
import { ConvexHttpClient } from "convex/browser";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  accountConfigResourceGraph,
  accountConfigResourceGraphToMermaid,
  accountConfigSourceNavigationItems,
  accountConfigSourceOutline,
  accountConfigDigest,
  accountMetadata,
  accountConfigFromFormaSource,
  accountConfigToFormaSource,
  dumpAccountDeploy,
  parseFormaAccountConfigSource,
  planAccountDeploy,
  validateAccountConfig,
} from "@metacrdt/account-config";
import { api } from "../convex/_generated/api.js";

const COMMANDS = new Set([
  "validate",
  "check-sources",
  "graph",
  "outline",
  "plan",
  "export",
  "forma",
  "from-forma",
  "normalize-forma",
  "validate-forma",
  "dump",
  "dump-deploy",
  "diff-deploy",
  "deploy-current",
  "deploy-list",
  "plan-deploy",
  "rollback-deploy",
  "review-deploy",
  "approve-deploy",
  "apply-deploy",
  "draft-save",
  "draft-list",
  "draft-export",
]);

function usage() {
  console.error(`Usage:
  pnpm account-config validate [--output json|yaml] <config.json|yaml|yml|forma>
  pnpm account-config check-sources [--output json|yaml] [configs/accounts]
  pnpm account-config graph [--output json|yaml|mermaid] <config.json|yaml|yml|forma>
  pnpm account-config outline [--output json|yaml] <config.json|yaml|yml|forma>
  pnpm account-config plan --tenant <slug> [--output json|yaml] <config.json|yaml|yml|forma>
  pnpm account-config export --tenant <slug> [--output json|yaml]
  pnpm account-config forma <config.json|yaml|yml>
  pnpm account-config from-forma [--output json|yaml] <config.forma>
  pnpm account-config normalize-forma [--check [--output json|yaml]|--write] <config.json|yaml|yml|forma>
  pnpm account-config validate-forma [--output json|yaml] <config.forma>
  pnpm account-config dump [--output json|yaml] <config.json|yaml|yml|forma>
  pnpm account-config dump-deploy [--output json|yaml] <config.json|yaml|yml|forma>
  pnpm account-config diff-deploy [--output json|yaml] [--current <account.deploy.json>] <config.json|yaml|yml|forma>
  pnpm account-config deploy-current --tenant <slug> [--output json|yaml]
  pnpm account-config deploy-list --tenant <slug> [--limit <n>] [--output json|yaml]
  pnpm account-config plan-deploy --tenant <slug> [--draft <name>] [--output json|yaml] <config.json|yaml|yml|forma>
  pnpm account-config rollback-deploy --tenant <slug> --plan <appliedPlanId> [--output json|yaml]
  pnpm account-config review-deploy --tenant <slug> --plan <planId> [--output json|yaml]
  pnpm account-config approve-deploy --tenant <slug> --plan <planId> [--output json|yaml]
  pnpm account-config apply-deploy --tenant <slug> --plan <planId> [--output json|yaml]
  pnpm account-config draft-save --tenant <slug> [--name <name>] [--review-note <text>] [--output json|yaml] <config.json|yaml|yml|forma>
  pnpm account-config draft-list --tenant <slug> [--limit <n>] [--output json|yaml]
  pnpm account-config draft-export --tenant <slug> [--name <name>] > configs/accounts/<tenant>.forma

Live plan/export commands use CONVEX_URL or NEXT_PUBLIC_CONVEX_URL plus auth:
  CONVEX_AUTH_TOKEN=<jwt>
  or CONVEX_ADMIN_TOKEN=<admin-token> CONVEX_ACTING_AS_TOKEN_IDENTIFIER=<principal>`);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!COMMANDS.has(command)) {
    usage();
    process.exit(2);
  }
  const opts = {
    command,
    tenant: undefined,
    url: undefined,
    file: undefined,
    name: undefined,
    draft: undefined,
    reviewNote: undefined,
    limit: undefined,
    planId: undefined,
    current: undefined,
    output: undefined,
    check: false,
    write: false,
  };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--tenant") opts.tenant = rest[++i];
    else if (arg === "--url") opts.url = rest[++i];
    else if (arg === "--name") opts.name = rest[++i];
    else if (arg === "--draft") opts.draft = rest[++i];
    else if (arg === "--review-note") opts.reviewNote = rest[++i];
    else if (arg === "--limit") opts.limit = rest[++i];
    else if (arg === "--plan") opts.planId = rest[++i];
    else if (arg === "--current") opts.current = rest[++i];
    else if (arg === "--output") opts.output = rest[++i];
    else if (arg === "--check") opts.check = true;
    else if (arg === "--write") opts.write = true;
    else if (arg.startsWith("--")) {
      console.error(`Unknown option: ${arg}`);
      process.exit(2);
    } else if (opts.file === undefined) {
      opts.file = arg;
    } else {
      console.error(`Unexpected argument: ${arg}`);
      process.exit(2);
    }
  }
  return opts;
}

function parsePositiveInt(value, flag, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

async function readConfigFile(path) {
  const source = await readFile(path, "utf8");
  const extension = path.split(".").pop()?.toLowerCase();
  try {
    if (extension === "yaml" || extension === "yml") {
      return parseYaml(source);
    }
    return JSON.parse(source);
  } catch (error) {
    const format = extension === "yaml" || extension === "yml" ? "YAML" : "JSON";
    throw new Error(`failed to read ${format} ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readSourceFile(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`failed to read ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function readAccountSourceFile(path) {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "forma") {
    const source = await readSourceFile(path);
    try {
      return accountConfigFromFormaSource(source);
    } catch (error) {
      throw new Error(`failed to read Forma ${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return await readConfigFile(path);
}

async function readDeployArtifactFile(path) {
  const raw = await readConfigFile(path);
  const prepared = raw?.prepared;
  if (
    prepared !== null &&
    typeof prepared === "object" &&
    prepared?.artifact !== undefined
  ) {
    return prepared.artifact;
  }
  return raw;
}

function accountSourceFormat(path) {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "json" && !path.endsWith("schema.json")) return "json";
  if (extension === "yaml" || extension === "yml") return "yaml";
  if (extension === "forma") return "forma";
  return undefined;
}

async function accountSourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = `${dir.replace(/\/$/, "")}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await accountSourceFiles(path)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (accountSourceFormat(path) !== undefined) files.push(path);
  }
  return files.sort();
}

function sourceFormat(path) {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "forma") return "forma";
  if (extension === "yaml" || extension === "yml") return "yaml";
  return "json";
}

function structuredOutputFormat(output, command) {
  if (output === undefined) return "json";
  if (output !== "json" && output !== "yaml") {
    throw new Error(`${command} --output must be json or yaml`);
  }
  return output;
}

function writeStructuredOutput(value, output) {
  if (output === "yaml") {
    process.stdout.write(stringifyYaml(value, { lineWidth: 0 }));
    return;
  }
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function sourceTextDigest(source) {
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

function diagnosticMessages(diagnostics) {
  return diagnostics.map((entry) => entry.message);
}

function validationSourceMetadata(file, source) {
  return {
    file,
    format: accountSourceFormat(file),
    sourceDigest: accountConfigDigest(source),
  };
}

function sourceLines(source) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function lineChangeCounts(before, after) {
  const left = sourceLines(before);
  const right = sourceLines(after);
  const dp = Array.from({ length: left.length + 1 }, () =>
    Array(right.length + 1).fill(0),
  );
  for (let i = left.length - 1; i >= 0; i--) {
    for (let j = right.length - 1; j >= 0; j--) {
      dp[i][j] = left[i] === right[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const unchanged = dp[0][0];
  return {
    added: right.length - unchanged,
    removed: left.length - unchanged,
    sourceLines: left.length,
    normalizedLines: right.length,
  };
}

function outlineDigestInput(outline) {
  return outline.map((group) => ({
    ...group,
    items: group.items.map(({ line, ...item }) => item),
  }));
}

function outlineReviewBlock(config, source) {
  const outline = accountConfigSourceOutline(config, source);
  return {
    digest: accountConfigDigest(outlineDigestInput(outline)),
    groups: outline,
    navigation: accountConfigSourceNavigationItems(outline, source),
  };
}

function clientFor(opts) {
  const url = opts.url ?? process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error(
      "CONVEX_URL or NEXT_PUBLIC_CONVEX_URL is required for live commands",
    );
  }
  const client = new ConvexHttpClient(url);
  const authToken = process.env.CONVEX_AUTH_TOKEN ?? process.env.AUTH_TOKEN;
  const adminToken = process.env.CONVEX_ADMIN_TOKEN;
  if (authToken) client.setAuth(authToken);
  else if (adminToken) {
    const tokenIdentifier = process.env.CONVEX_ACTING_AS_TOKEN_IDENTIFIER;
    if (tokenIdentifier) client.setAdminAuth(adminToken, { tokenIdentifier });
    else client.setAdminAuth(adminToken);
  }
  return client;
}

function assertValid(config, output, sourceMetadata) {
  const diagnostics = validateAccountConfig(config);
  if (diagnostics.length > 0) {
    if (output === "json" || output === "yaml") {
      writeStructuredOutput(
        {
          valid: false,
          ...(sourceMetadata ?? {}),
          errors: diagnostics,
          diagnostics: diagnostics.map((message) => ({ message })),
        },
        output,
      );
    } else {
      console.error(JSON.stringify({ valid: false, errors: diagnostics }, null, 2));
    }
    process.exit(1);
  }
}

function assertAccountMatchesTenant(config, tenantSlug, output, sourceMetadata) {
  const metadata = accountMetadata(config);
  if (metadata.slug !== tenantSlug) {
    const message = `account slug ${metadata.slug} does not match tenant ${tenantSlug}`;
    if (output === "json" || output === "yaml") {
      writeStructuredOutput(
        {
          valid: false,
          ...(sourceMetadata ?? {}),
          errors: [message],
          diagnostics: [{ message }],
        },
        output,
      );
      process.exit(1);
    }
    throw new Error(message);
  }
}

function parseAccountSourceTextForDraft(path, source) {
  const format = accountSourceFormat(path);
  if (format === undefined) {
    throw new Error(`unsupported account source format: ${path}`);
  }
  if (format === "forma") {
    const parsed = parseFormaAccountConfigSource(source);
    return {
      format,
      config: parsed.config,
      diagnostics: parsed.diagnostics,
    };
  }

  try {
    const config = format === "yaml" ? parseYaml(source) : JSON.parse(source);
    return { format, config, diagnostics: [] };
  } catch (error) {
    const label = format === "yaml" ? "YAML" : "JSON";
    return {
      format,
      config: null,
      diagnostics: [
        {
          message: `failed to read ${label} ${path}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
    };
  }
}

function assertParsedAccountSource(file, source, parsed, output) {
  if (parsed.config !== null) return parsed.config;
  const errors = diagnosticMessages(parsed.diagnostics);
  if (output === "json" || output === "yaml") {
    writeStructuredOutput(
      {
        valid: false,
        ...validationSourceMetadata(file, source),
        errors,
        diagnostics: parsed.diagnostics,
      },
      output,
    );
    process.exit(1);
  }
  throw new Error(errors.join("\n") || `unable to parse account source: ${file}`);
}

const opts = parseArgs(process.argv.slice(2));

try {
  if (opts.command === "validate") {
    if (!opts.file) throw new Error("validate requires a config file");
    const output = structuredOutputFormat(opts.output, "validate");
    if (accountSourceFormat(opts.file) === "forma") {
      const source = await readSourceFile(opts.file);
      const parsed = parseFormaAccountConfigSource(source);
      const errors = diagnosticMessages(parsed.diagnostics);
      writeStructuredOutput(
        {
          valid: errors.length === 0,
          ...validationSourceMetadata(opts.file, source),
          errors,
          diagnostics: parsed.diagnostics,
        },
        output,
      );
      process.exit(errors.length === 0 ? 0 : 1);
    }
    const source = await readSourceFile(opts.file);
    const format = accountSourceFormat(opts.file);
    let config;
    try {
      if (format === "yaml") {
        config = parseYaml(source);
      } else if (format === "json") {
        config = JSON.parse(source);
      } else {
        throw new Error(`unsupported account source format: ${opts.file}`);
      }
    } catch (error) {
      const label = format === "yaml" ? "YAML" : format === "json" ? "JSON" : "account source";
      const diagnostics = [
        {
          message: `failed to read ${label} ${opts.file}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ];
      writeStructuredOutput(
        {
          valid: false,
          ...validationSourceMetadata(opts.file, source),
          errors: diagnosticMessages(diagnostics),
          diagnostics,
        },
        output,
      );
      process.exit(1);
    }
    const diagnostics = validateAccountConfig(config);
    writeStructuredOutput(
      {
        valid: diagnostics.length === 0,
        ...validationSourceMetadata(opts.file, source),
        errors: diagnostics,
        diagnostics: diagnostics.map((message) => ({ message })),
      },
      output,
    );
    process.exit(diagnostics.length === 0 ? 0 : 1);
  }

  if (opts.command === "check-sources") {
    const output = structuredOutputFormat(opts.output, "check-sources");
    const dir = opts.file ?? "configs/accounts";
    const files = await accountSourceFiles(dir);
    const results = [];
    for (const file of files) {
      const format = accountSourceFormat(file);
      try {
        let source;
        let config;
        let sourceDiagnostics;
        if (format === "forma") {
          source = await readSourceFile(file);
          const parsed = parseFormaAccountConfigSource(source);
          sourceDiagnostics = parsed.diagnostics;
          if (parsed.config === null) {
            results.push({
              file,
              format,
              valid: false,
              normalized: false,
              sourceDigest: accountConfigDigest(source),
              errors: diagnosticMessages(sourceDiagnostics),
              diagnostics: sourceDiagnostics,
            });
            continue;
          }
          config = parsed.config;
        } else {
          source = await readSourceFile(file);
          const parsed = parseAccountSourceTextForDraft(file, source);
          sourceDiagnostics = parsed.diagnostics;
          if (parsed.config === null) {
            results.push({
              file,
              format: parsed.format,
              valid: false,
              sourceDigest: accountConfigDigest(source),
              errors: diagnosticMessages(sourceDiagnostics),
              diagnostics: sourceDiagnostics,
            });
            continue;
          }
          config = parsed.config;
          sourceDiagnostics = validateAccountConfig(config).map((message) => ({
            message,
          }));
        }
        const dump = dumpAccountDeploy(config);
        const plan = planAccountDeploy(null, dump.prepared.artifact);
        const graphEdges = accountConfigResourceGraph(config);
        const graphDigest = accountConfigDigest(graphEdges);
        const outline = outlineReviewBlock(config, source);
        const normalized =
          format === "forma" && source !== undefined
            ? source === accountConfigToFormaSource(config)
            : undefined;
        const normalizationDiagnostics =
          normalized === false
            ? [
                {
                  message: `Forma source is not normalized; run pnpm account-config normalize-forma --write ${file}`,
                },
              ]
            : [];
        const deployErrors = plan.valid ? [] : plan.errors;
        const allDiagnostics = [...sourceDiagnostics, ...normalizationDiagnostics];
        const allErrors = [...diagnosticMessages(allDiagnostics), ...deployErrors];
        results.push({
          file,
          format,
          valid: allErrors.length === 0,
          ...(normalized === undefined ? {} : { normalized }),
          accountSlug: dump.source.account.slug,
          sourceDigest: dump.source.digest,
          artifactDigest: dump.prepared.digest,
          manifest: dump.source.manifest,
          resourceGraph: {
            digest: graphDigest,
            edgeCount: graphEdges.length,
            edges: graphEdges,
          },
          sourceOutline: outline,
          plan: {
            valid: plan.valid,
            empty: plan.empty,
            destructive: plan.destructive,
            totals: plan.totals,
          },
          errors: allErrors,
          diagnostics: allDiagnostics,
        });
      } catch (error) {
        results.push({
          file,
          format,
          valid: false,
          errors: [error instanceof Error ? error.message : String(error)],
        });
      }
    }
    const byAccount = new Map();
    for (const result of results) {
      if (!result.valid || result.accountSlug === undefined || result.artifactDigest === undefined) {
        continue;
      }
      const bucket = byAccount.get(result.accountSlug) ?? [];
      bucket.push(result);
      byAccount.set(result.accountSlug, bucket);
    }
    for (const [accountSlug, group] of byAccount.entries()) {
      const digests = new Set(group.map((result) => result.artifactDigest));
      if (digests.size > 1) {
        const message = `account ${accountSlug} sources produce different artifact digests`;
        for (const result of group) {
          result.valid = false;
          result.errors.push(message);
        }
      }
      const graphDigests = new Set(
        group.map((result) => result.resourceGraph?.digest).filter(Boolean),
      );
      if (graphDigests.size > 1) {
        const message = `account ${accountSlug} sources produce different resource graph digests`;
        for (const result of group) {
          result.valid = false;
          result.errors.push(message);
        }
      }
      const outlineDigests = new Set(
        group.map((result) => result.sourceOutline?.digest).filter(Boolean),
      );
      if (outlineDigests.size > 1) {
        const message = `account ${accountSlug} sources produce different source outline digests`;
        for (const result of group) {
          result.valid = false;
          result.errors.push(message);
        }
      }
    }
    const summaryByAccount = new Map();
    for (const result of results) {
      if (result.accountSlug === undefined) continue;
      const bucket = summaryByAccount.get(result.accountSlug) ?? [];
      bucket.push(result);
      summaryByAccount.set(result.accountSlug, bucket);
    }
    const singleDigest = (values) => {
      const digests = new Set(values.filter(Boolean));
      return digests.size === 1 ? [...digests][0] : null;
    };
    const accountSummaries = [...summaryByAccount.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([accountSlug, group]) => ({
        accountSlug,
        files: group.length,
        valid: group.every((result) => result.valid),
        invalidFiles: group.filter((result) => !result.valid).length,
        formats: [...new Set(group.map((result) => result.format))].sort(),
        artifactDigest: singleDigest(group.map((result) => result.artifactDigest)),
        resourceGraphDigest: singleDigest(
          group.map((result) => result.resourceGraph?.digest),
        ),
        sourceOutlineDigest: singleDigest(
          group.map((result) => result.sourceOutline?.digest),
        ),
      }));
    const ok = results.every((result) => result.valid && result.normalized !== false);
    writeStructuredOutput(
      {
        valid: ok,
        summary: {
          files: results.length,
          validFiles: results.filter((result) => result.valid).length,
          invalidFiles: results.filter((result) => !result.valid).length,
          accounts: accountSummaries.length,
          validAccounts: accountSummaries.filter((account) => account.valid).length,
          accountSummaries,
        },
        files: results,
      },
      output,
    );
    process.exit(ok ? 0 : 1);
  }

  if (opts.command === "graph") {
    if (!opts.file) throw new Error("graph requires a config source file");
    if (
      opts.output !== undefined &&
      opts.output !== "json" &&
      opts.output !== "yaml" &&
      opts.output !== "mermaid"
    ) {
      throw new Error("graph --output must be json, yaml, or mermaid");
    }
    const source = await readSourceFile(opts.file);
    const config = await readAccountSourceFile(opts.file);
    assertValid(
      config,
      opts.output === "yaml" ? "yaml" : "json",
      validationSourceMetadata(opts.file, source),
    );
    const dump = dumpAccountDeploy(config);
    const edges = accountConfigResourceGraph(config);
    const graphDigest = accountConfigDigest(edges);
    if (opts.output === "mermaid") {
      process.stdout.write(
        accountConfigResourceGraphToMermaid(edges, { account: dump.source.account }),
      );
      process.exit(0);
    }
    writeStructuredOutput(
      {
        account: dump.source.account,
        sourceDigest: dump.source.digest,
        artifactDigest: dump.prepared.digest,
        manifest: dump.source.manifest,
        graphDigest,
        edges,
      },
      opts.output ?? "json",
    );
    process.exit(0);
  }

  if (opts.command === "outline") {
    if (!opts.file) throw new Error("outline requires a config source file");
    const output = structuredOutputFormat(opts.output, "outline");
    const source = await readSourceFile(opts.file);
    let config;
    if (accountSourceFormat(opts.file) === "forma") {
      const parsed = parseFormaAccountConfigSource(source);
      if (parsed.config === null || parsed.diagnostics.length > 0) {
        writeStructuredOutput(
          {
            valid: false,
            errors: diagnosticMessages(parsed.diagnostics),
            diagnostics: parsed.diagnostics,
          },
          output,
        );
        process.exit(1);
      }
      config = parsed.config;
    } else {
      config = await readAccountSourceFile(opts.file);
      assertValid(config, output, validationSourceMetadata(opts.file, source));
    }
    const dump = dumpAccountDeploy(config);
    const outline = outlineReviewBlock(config, source);
    writeStructuredOutput(
      {
        account: dump.source.account,
        sourceDigest: dump.source.digest,
        artifactDigest: dump.prepared.digest,
        outlineDigest: outline.digest,
        outline: outline.groups,
        navigation: outline.navigation,
      },
      output,
    );
    process.exit(0);
  }

  if (opts.command === "forma") {
    if (!opts.file) throw new Error("forma requires a config file");
    const config = await readConfigFile(opts.file);
    assertValid(config);
    process.stdout.write(accountConfigToFormaSource(config));
    process.exit(0);
  }

  if (opts.command === "from-forma") {
    if (!opts.file) throw new Error("from-forma requires a Forma source file");
    const output = structuredOutputFormat(opts.output, "from-forma");
    const source = await readSourceFile(opts.file);
    const parsed = parseFormaAccountConfigSource(source);
    if (parsed.config === null || parsed.diagnostics.length > 0) {
      const errors = diagnosticMessages(parsed.diagnostics);
      writeStructuredOutput(
        {
          valid: false,
          ...validationSourceMetadata(opts.file, source),
          errors,
          diagnostics: parsed.diagnostics,
        },
        output,
      );
      process.exit(1);
    }
    const config = parsed.config;
    assertValid(config, output);
    writeStructuredOutput(config, output);
    process.exit(0);
  }

  if (opts.command === "normalize-forma") {
    if (!opts.file) throw new Error("normalize-forma requires a config source file");
    if (opts.check && opts.write) {
      throw new Error("normalize-forma accepts only one of --check or --write");
    }
    let source;
    let config;
    if (accountSourceFormat(opts.file) === "forma") {
      source = await readSourceFile(opts.file);
      const parsed = parseFormaAccountConfigSource(source);
      if (parsed.config === null || parsed.diagnostics.length > 0) {
        const errors = diagnosticMessages(parsed.diagnostics);
        if (opts.check) {
          const output = structuredOutputFormat(opts.output, "normalize-forma");
          writeStructuredOutput(
            {
              normalized: false,
              file: opts.file,
              format: accountSourceFormat(opts.file),
              sourceDigest: accountConfigDigest(source),
              errors,
              diagnostics: parsed.diagnostics,
            },
            output,
          );
          process.exit(1);
        }
        throw new Error(
          errors[0] ?? `failed to read Forma ${opts.file}`,
        );
      }
      config = parsed.config;
    } else {
      config = await readAccountSourceFile(opts.file);
    }
    assertValid(config, opts.check ? structuredOutputFormat(opts.output, "normalize-forma") : undefined);
    const normalized = accountConfigToFormaSource(config);
    if (opts.check) {
      const output = structuredOutputFormat(opts.output, "normalize-forma");
      source ??= await readSourceFile(opts.file);
      const formatted = source === normalized;
      writeStructuredOutput(
        {
          normalized: formatted,
          file: opts.file,
          sourceDigest: accountConfigDigest(source),
          normalizedDigest: accountConfigDigest(normalized),
          diff: lineChangeCounts(source, normalized),
        },
        output,
      );
      process.exit(formatted ? 0 : 1);
    }
    if (opts.output !== undefined) {
      throw new Error("normalize-forma --output is only valid with --check");
    }
    if (opts.write) {
      await writeFile(opts.file, normalized);
      console.log(JSON.stringify({ normalized: true, written: opts.file }, null, 2));
      process.exit(0);
    }
    process.stdout.write(normalized);
    process.exit(0);
  }

  if (opts.command === "validate-forma") {
    if (!opts.file) throw new Error("validate-forma requires a Forma source file");
    const output = structuredOutputFormat(opts.output, "validate-forma");
    const source = await readSourceFile(opts.file);
    const parsed = parseFormaAccountConfigSource(source);
    const errors = diagnosticMessages(parsed.diagnostics);
    writeStructuredOutput(
      {
        valid: errors.length === 0,
        ...validationSourceMetadata(opts.file, source),
        errors,
        diagnostics: parsed.diagnostics,
      },
      output,
    );
    process.exit(errors.length === 0 ? 0 : 1);
  }

  if (opts.command === "dump" || opts.command === "dump-deploy") {
    if (!opts.file) throw new Error(`${opts.command} requires a config source file`);
    const output = structuredOutputFormat(opts.output, opts.command);
    const source = await readSourceFile(opts.file);
    const config = await readAccountSourceFile(opts.file);
    assertValid(config, output, validationSourceMetadata(opts.file, source));
    writeStructuredOutput(dumpAccountDeploy(config), output);
    process.exit(0);
  }

  if (opts.command === "diff-deploy") {
    if (!opts.file) throw new Error("diff-deploy requires a config source file");
    const output = structuredOutputFormat(opts.output, "diff-deploy");
    const source = await readSourceFile(opts.file);
    const config = await readAccountSourceFile(opts.file);
    assertValid(config, output, validationSourceMetadata(opts.file, source));
    const dump = dumpAccountDeploy(config);
    const current = opts.current === undefined
      ? null
      : await readDeployArtifactFile(opts.current);
    const plan = planAccountDeploy(current, dump.prepared.artifact);
    writeStructuredOutput(
      {
        ...plan,
        source: {
          file: opts.file,
          format: accountSourceFormat(opts.file),
          account: dump.source.account,
          digest: dump.source.digest,
          manifest: dump.source.manifest,
        },
        prepared: {
          digest: dump.prepared.digest,
          manifest: dump.prepared.artifact.manifest,
        },
      },
      output,
    );
    process.exit(0);
  }

  const output = structuredOutputFormat(opts.output, opts.command);
  if (!opts.tenant) {
    throw new Error(`${opts.command} requires --tenant <slug>`);
  }

  if (opts.command === "plan") {
    if (!opts.file) throw new Error("plan requires a config file");
    const source = await readSourceFile(opts.file);
    const sourceMetadata = validationSourceMetadata(opts.file, source);
    const parsed = parseAccountSourceTextForDraft(opts.file, source);
    const config = assertParsedAccountSource(opts.file, source, parsed, output);
    assertValid(config, output, sourceMetadata);
    assertAccountMatchesTenant(config, opts.tenant, output, sourceMetadata);
    const client = clientFor(opts);
    const plan = await client.query(api.appconfig.planConfig, {
      tenantSlug: opts.tenant,
      config,
    });
    writeStructuredOutput(plan, output);
  } else if (opts.command === "deploy-current") {
    const client = clientFor(opts);
    const current = await client.query(api.accountDeploy.currentDeployment, {
      tenantSlug: opts.tenant,
    });
    writeStructuredOutput(current, output);
  } else if (opts.command === "deploy-list") {
    const limit = parsePositiveInt(opts.limit, "--limit", 10);
    const client = clientFor(opts);
    const plans = await client.query(api.accountDeploy.listPlans, {
      tenantSlug: opts.tenant,
      limit,
    });
    writeStructuredOutput(plans, output);
  } else if (opts.command === "plan-deploy") {
    if (!opts.file) throw new Error("plan-deploy requires a config source file");
    const format = sourceFormat(opts.file);
    const source = await readSourceFile(opts.file);
    const sourceMetadata = validationSourceMetadata(opts.file, source);
    const parsed = parseAccountSourceTextForDraft(opts.file, source);
    const config = assertParsedAccountSource(opts.file, source, parsed, output);
    assertValid(config, output, sourceMetadata);
    assertAccountMatchesTenant(config, opts.tenant, output, sourceMetadata);
    const dump = dumpAccountDeploy(config);
    const client = clientFor(opts);
    const draft = opts.draft === undefined
      ? null
      : await client.query(api.accountConfigDrafts.latestDraft, {
          tenantSlug: opts.tenant,
          name: opts.draft,
        });
    if (opts.draft !== undefined && draft === null) {
      throw new Error(`draft not found: ${opts.draft}`);
    }
    if (draft !== null) {
      const digest = sourceTextDigest(source);
      if (digest !== draft.sourceDigest) {
        throw new Error(
          `draft source digest mismatch: expected ${draft.sourceDigest}, got ${digest}`,
        );
      }
      if (format !== draft.sourceFormat) {
        throw new Error(
          `draft source format mismatch: expected ${draft.sourceFormat}, got ${format}`,
        );
      }
      if (
        draft.artifactDigest !== undefined &&
        draft.artifactDigest !== dump.prepared.digest
      ) {
        throw new Error(
          `draft artifact digest mismatch: expected ${draft.artifactDigest}, got ${dump.prepared.digest}`,
        );
      }
    }
    const plan = await client.mutation(api.accountDeploy.planFromArtifact, {
      tenantSlug: opts.tenant,
      config,
      artifact: dump.prepared.artifact,
      sourceDigest: dump.source.digest,
      artifactDigest: dump.prepared.digest,
      sourceFormat: format,
      ...(draft === null
        ? {}
        : { draftId: draft._id, draftSourceDigest: draft.sourceDigest }),
    });
    writeStructuredOutput(plan, output);
  } else if (opts.command === "rollback-deploy") {
    if (!opts.planId) throw new Error("rollback-deploy requires --plan <appliedPlanId>");
    const client = clientFor(opts);
    const rollback = await client.mutation(api.accountDeploy.planRollback, {
      tenantSlug: opts.tenant,
      planId: opts.planId,
    });
    writeStructuredOutput(rollback, output);
  } else if (opts.command === "review-deploy") {
    if (!opts.planId) throw new Error("review-deploy requires --plan <planId>");
    const client = clientFor(opts);
    const review = await client.query(api.accountDeploy.reviewPlan, {
      tenantSlug: opts.tenant,
      planId: opts.planId,
    });
    writeStructuredOutput(review, output);
  } else if (opts.command === "approve-deploy") {
    if (!opts.planId) throw new Error("approve-deploy requires --plan <planId>");
    const client = clientFor(opts);
    const approved = await client.mutation(api.accountDeploy.approvePlan, {
      tenantSlug: opts.tenant,
      planId: opts.planId,
    });
    writeStructuredOutput(approved, output);
  } else if (opts.command === "apply-deploy") {
    if (!opts.planId) throw new Error("apply-deploy requires --plan <planId>");
    const client = clientFor(opts);
    const applied = await client.mutation(api.accountDeploy.applyPlan, {
      tenantSlug: opts.tenant,
      planId: opts.planId,
    });
    writeStructuredOutput(applied, output);
  } else if (opts.command === "draft-save") {
    if (!opts.file) throw new Error("draft-save requires a config source file");
    const source = await readSourceFile(opts.file);
    const parsed = parseAccountSourceTextForDraft(opts.file, source);
    let artifactDigest;
    if (parsed.config !== null) {
      const diagnostics = validateAccountConfig(parsed.config);
      if (diagnostics.length === 0) {
        assertAccountMatchesTenant(
          parsed.config,
          opts.tenant,
          output,
          validationSourceMetadata(opts.file, source),
        );
        artifactDigest = dumpAccountDeploy(parsed.config).prepared.digest;
      }
    }
    const client = clientFor(opts);
    const saved = await client.mutation(api.accountConfigDrafts.saveDraft, {
      tenantSlug: opts.tenant,
      name: opts.name,
      source,
      sourceFormat: parsed.format,
      ...(parsed.config === null ? {} : { config: parsed.config }),
      ...(artifactDigest === undefined ? {} : { artifactDigest }),
      checkedInPath: opts.file,
      checkedInDigest: sourceTextDigest(source),
      ...(opts.reviewNote === undefined ? {} : { reviewNote: opts.reviewNote }),
      diagnostics: parsed.diagnostics,
    });
    writeStructuredOutput(
      {
        ...saved,
        tenantSlug: opts.tenant,
        name: opts.name ?? "default",
        sourceFormat: parsed.format,
        checkedInPath: opts.file,
        checkedInDigest: sourceTextDigest(source),
        diagnostics: parsed.diagnostics,
      },
      output,
    );
  } else if (opts.command === "draft-list") {
    const limit = parsePositiveInt(opts.limit, "--limit", 10);
    const client = clientFor(opts);
    const drafts = await client.query(api.accountConfigDrafts.listDrafts, {
      tenantSlug: opts.tenant,
      limit,
    });
    writeStructuredOutput(
      drafts.map((draft) => ({
        id: draft._id,
        name: draft.name,
        sourceFormat: draft.sourceFormat,
        sourceDigest: draft.sourceDigest,
        checkedInPath: draft.checkedInPath,
        checkedInDigest: draft.checkedInDigest,
        reviewNote: draft.reviewNote,
        validation: draft.validation,
        updatedAt: draft.updatedAt,
        updatedBy: draft.updatedBy,
      })),
      output,
    );
  } else if (opts.command === "draft-export") {
    const client = clientFor(opts);
    const draft = await client.query(api.accountConfigDrafts.latestDraft, {
      tenantSlug: opts.tenant,
      name: opts.name,
    });
    if (draft === null) {
      throw new Error(`draft not found: ${opts.name ?? "default"}`);
    }
    process.stdout.write(draft.source.endsWith("\n") ? draft.source : `${draft.source}\n`);
  } else if (opts.command === "export") {
    const output = structuredOutputFormat(opts.output, "export");
    const client = clientFor(opts);
    const exported = await client.query(api.appconfig.exportConfig, {
      tenantSlug: opts.tenant,
    });
    writeStructuredOutput(exported, output);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
