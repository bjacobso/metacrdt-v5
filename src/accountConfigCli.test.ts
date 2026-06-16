import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const execFileAsync = promisify(execFile);

async function runCli(args: string[]) {
  return await execFileAsync("node", ["scripts/account-config.mjs", ...args], {
    cwd: process.cwd(),
    maxBuffer: 8 * 1024 * 1024,
  });
}

describe("account-config CLI review artifacts", () => {
  beforeAll(async () => {
    await execFileAsync("pnpm", ["--silent", "--filter", "@forma/ts", "build"], {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024,
    });
    await execFileAsync(
      "pnpm",
      ["--silent", "--filter", "@metacrdt/account-config", "build"],
      {
        cwd: process.cwd(),
        maxBuffer: 1024 * 1024,
      },
    );
  }, 30_000);

  it("keeps the CLI surface greenfield-only", async () => {
    let stderr = "";
    let code: number | undefined;
    try {
      await runCli(["migrate-default-tenant"]);
    } catch (error) {
      stderr = (error as { stderr?: string }).stderr ?? "";
      code = (error as { code?: number }).code;
    }

    expect(code).toBe(2);
    expect(stderr).toContain("Usage:");
    expect(stderr).not.toMatch(
      /\b(?:migration|backfill|default-tenant|migrate-default-tenant)\b/,
    );
  });

  it("emits graph review metadata as YAML for checked-in Forma source", async () => {
    const { stdout } = await runCli([
      "graph",
      "--output",
      "yaml",
      "configs/accounts/legal-workflows.forma",
    ]);
    const graph = parseYaml(stdout) as {
      account: { slug: string; name: string };
      graphDigest: string;
      edges: Array<{ fromKind: string; relation: string; toName: string }>;
    };

    expect(graph.account).toMatchObject({
      slug: "legal-workflows",
      name: "Legal Workflows",
    });
    expect(graph.graphDigest).toMatch(/^cyrb53:/);
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromKind: "entityType",
          relation: "flow",
          toName: "matter_intake",
        }),
        expect.objectContaining({
          fromKind: "flow",
          relation: "collect",
          toName: "conflict_check",
        }),
      ]),
    );
  });

  it("emits line-numbered source outline navigation as JSON", async () => {
    const { stdout } = await runCli([
      "outline",
      "--output",
      "json",
      "configs/accounts/legal-workflows.forma",
    ]);
    const outline = JSON.parse(stdout) as {
      account: { slug: string };
      outlineDigest: string;
      navigation: Array<{ label: string; line: number; sourceLine?: string }>;
    };

    expect(outline.account.slug).toBe("legal-workflows");
    expect(outline.outlineDigest).toMatch(/^cyrb53:/);
    expect(outline.navigation).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Account: legal-workflows",
          line: 1,
          sourceLine: '(tenant "legal-workflows" "Legal Workflows" "legal")',
        }),
        expect.objectContaining({
          label: "Flows: matter_intake",
          sourceLine: expect.stringContaining('(flow "matter_intake"'),
        }),
      ]),
    );
  });

  it("emits parser repair hints as structured validate diagnostics", async () => {
    const dir = await mkdtemp(join(tmpdir(), "account-config-invalid-"));
    try {
      const sourcePath = join(dir, "broken.forma");
      await writeFile(
        sourcePath,
        `
(tenant legal-workflows "Legal Workflows" legal)
(account-config
  (forms
    (fom intake "Intake")))
`,
        "utf8",
      );

      let stdout = "";
      try {
        await runCli(["validate", "--output", "json", sourcePath]);
      } catch (error) {
        stdout = (error as { stdout?: string }).stdout ?? "";
      }
      const result = JSON.parse(stdout) as {
        valid: boolean;
        file: string;
        format: string;
        sourceDigest: string;
        errors: string[];
        diagnostics: Array<{
          message: string;
          loc?: { line: number; col: number };
        }>;
      };

      expect(result.valid).toBe(false);
      expect(result).toMatchObject({
        file: sourcePath,
        format: "forma",
        sourceDigest: expect.stringMatching(/^cyrb53:/),
      });
      expect(result.errors).toEqual([
        "forms wrapper can only contain form resources; found fom. Did you mean form?",
      ]);
      expect(result.diagnostics).toEqual([
        expect.objectContaining({
          message:
            "forms wrapper can only contain form resources; found fom. Did you mean form?",
          loc: expect.objectContaining({ line: 5, col: 5 }),
        }),
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("validates and normalizes compact timing-step aliases", async () => {
    const dir = await mkdtemp(join(tmpdir(), "account-config-timing-"));
    try {
      const sourcePath = join(dir, "timing.forma");
      await writeFile(
        sourcePath,
        `
(tenant timing-demo "Timing Demo" custom)
(attr client entityRef)
(entity Case [client])
(flow review Case "Review" "Uses timing aliases." delay_review
  (delay delay_review 300 (next pause_review))
  (pause pause_review 60 (next done))
  (done))
`,
        "utf8",
      );

      const { stdout: validateStdout } = await runCli([
        "validate",
        "--output",
        "json",
        sourcePath,
      ]);
      const validation = JSON.parse(validateStdout) as {
        valid: boolean;
        format: string;
        errors: string[];
        diagnostics: unknown[];
      };

      expect(validation).toMatchObject({
        valid: true,
        format: "forma",
        errors: [],
        diagnostics: [],
      });

      const { stdout: normalized } = await runCli(["normalize-forma", sourcePath]);
      expect(normalized).toContain('(wait "delay_review" 300 (next "pause_review"))');
      expect(normalized).toContain('(wait "pause_review" 60 (next "done"))');
      expect(normalized).not.toContain("(delay ");
      expect(normalized).not.toContain("(pause ");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("emits source metadata for invalid Forma conversion and normalization checks", async () => {
    const dir = await mkdtemp(join(tmpdir(), "account-config-invalid-forma-"));
    try {
      const sourcePath = join(dir, "broken.forma");
      await writeFile(
        sourcePath,
        `
(tenant legal-workflows "Legal Workflows" legal)
(account-config
  (forms
    (fom intake "Intake")))
`,
        "utf8",
      );

      for (const command of ["from-forma", "normalize-forma"] as const) {
        let stdout = "";
        let code: number | undefined;
        try {
          await runCli(
            command === "normalize-forma"
              ? [command, "--check", "--output", "json", sourcePath]
              : [command, "--output", "json", sourcePath],
          );
        } catch (error) {
          stdout = (error as { stdout?: string }).stdout ?? "";
          code = (error as { code?: number }).code;
        }
        const result = JSON.parse(stdout) as {
          valid?: boolean;
          normalized?: boolean;
          file: string;
          format: string;
          sourceDigest: string;
          errors: string[];
          diagnostics: Array<{
            message: string;
            loc?: { line: number; col: number };
          }>;
        };

        expect(code).toBe(1);
        expect(result).toMatchObject({
          file: sourcePath,
          format: "forma",
          sourceDigest: expect.stringMatching(/^cyrb53:/),
          errors: [
            "forms wrapper can only contain form resources; found fom. Did you mean form?",
          ],
          diagnostics: [
            expect.objectContaining({
              message:
                "forms wrapper can only contain form resources; found fom. Did you mean form?",
              loc: expect.objectContaining({ line: 5, col: 5 }),
            }),
          ],
        });
        if (command === "from-forma") {
          expect(result.valid).toBe(false);
        } else {
          expect(result.normalized).toBe(false);
        }
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("emits duplicate singleton metadata as structured validate diagnostics", async () => {
    const dir = await mkdtemp(join(tmpdir(), "account-config-ambiguous-"));
    try {
      const sourcePath = join(dir, "ambiguous.forma");
      await writeFile(
        sourcePath,
        `
(tenant legal-workflows "Legal Workflows" legal)
(form intake "Intake"
  (title "First")
  (title "Second")
  (field ready boolean "Ready"
    (label "Ready?")
    (label "Ready again")))
`,
        "utf8",
      );

      let stdout = "";
      try {
        await runCli(["validate", "--output", "json", sourcePath]);
      } catch (error) {
        stdout = (error as { stdout?: string }).stdout ?? "";
      }
      const result = JSON.parse(stdout) as {
        valid: boolean;
        file: string;
        format: string;
        sourceDigest: string;
        errors: string[];
        diagnostics: Array<{
          message: string;
          loc?: { line: number; col: number };
        }>;
      };

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual([
        "form intake has multiple title entries; only the first is used",
        "form intake field ready has multiple label entries; only the first is used",
      ]);
      expect(result.diagnostics).toEqual([
        expect.objectContaining({
          message: "form intake has multiple title entries; only the first is used",
          loc: expect.objectContaining({ line: 5, col: 3 }),
        }),
        expect.objectContaining({
          message:
            "form intake field ready has multiple label entries; only the first is used",
          loc: expect.objectContaining({ line: 8, col: 5 }),
        }),
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("emits source metadata for validate-forma review artifacts", async () => {
    const { stdout } = await runCli([
      "validate-forma",
      "--output",
      "json",
      "configs/accounts/legal-workflows.forma",
    ]);
    const result = JSON.parse(stdout) as {
      valid: boolean;
      file: string;
      format: string;
      sourceDigest: string;
      errors: string[];
      diagnostics: unknown[];
    };

    expect(result).toMatchObject({
      valid: true,
      file: "configs/accounts/legal-workflows.forma",
      format: "forma",
      sourceDigest: expect.stringMatching(/^cyrb53:/),
      errors: [],
      diagnostics: [],
    });
  });

  it("emits authored-line field default diagnostics for Forma validate sources", async () => {
    const dir = await mkdtemp(join(tmpdir(), "account-config-forma-defaults-"));
    try {
      const sourcePath = join(dir, "bad-defaults.forma");
      await writeFile(
        sourcePath,
        `
(tenant default-demo "Default Demo" custom)
(attr "case.status" string)
(entity Case ["case.status"])
(form intake "Intake"
  (field "bad_date_default" date "Bad date" (default false)))
`,
        "utf8",
      );

      let stdout = "";
      let code: number | undefined;
      try {
        await runCli(["validate", "--output", "json", sourcePath]);
      } catch (error) {
        stdout = (error as { stdout?: string }).stdout ?? "";
        code = (error as { code?: number }).code;
      }
      const result = JSON.parse(stdout) as {
        valid: boolean;
        errors: string[];
        diagnostics: Array<{
          message: string;
          path?: string;
          loc?: { line: number; col: number };
        }>;
      };

      expect(code).toBe(1);
      expect(result.valid).toBe(false);
      expect(result).toMatchObject({
        file: sourcePath,
        format: "forma",
        sourceDigest: expect.stringMatching(/^cyrb53:/),
      });
      expect(result.errors).toEqual([
        "form intake field bad_date_default defaultValue must be a string",
      ]);
      expect(result.diagnostics).toEqual([
        expect.objectContaining({
          message: "form intake field bad_date_default defaultValue must be a string",
          path: "formField:intake:bad_date_default",
          loc: expect.objectContaining({ line: 6, col: 3 }),
        }),
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("emits field default diagnostics for JSON/YAML validate sources", async () => {
    const dir = await mkdtemp(join(tmpdir(), "account-config-defaults-"));
    try {
      const config = {
        account: {
          slug: "default-demo",
          name: "Default Demo",
          kind: "custom",
        },
        attributes: [
          {
            name: "case.status",
            valueType: "string",
            cardinality: "one",
          },
        ],
        entityTypes: [{ name: "Case", attributes: ["case.status"] }],
        forms: [
          {
            form: "intake",
            title: "Intake",
            fields: [
              {
                name: "bad_number_default",
                label: "Bad number",
                type: "number",
                defaultValue: "high",
              },
              {
                name: "bad_boolean_default",
                label: "Bad boolean",
                type: "boolean",
                defaultValue: "true",
              },
              {
                name: "bad_string_default",
                label: "Bad string",
                type: "string",
                defaultValue: false,
              },
              {
                name: "bad_date_default",
                label: "Bad date",
                type: "date",
                defaultValue: false,
              },
              {
                name: "bad_select_default",
                label: "Bad select",
                type: "select",
                options: ["open", "closed"],
                defaultValue: "missing",
              },
            ],
          },
        ],
        actions: [
          {
            name: "close",
            appliesTo: "Case",
            fields: [
              {
                name: "bad_action_number",
                label: "Bad action number",
                type: "number",
                defaultValue: "high",
              },
              {
                name: "bad_action_boolean",
                label: "Bad action boolean",
                type: "boolean",
                defaultValue: "true",
              },
              {
                name: "bad_action_string",
                label: "Bad action string",
                type: "string",
                defaultValue: false,
              },
              {
                name: "bad_action_select",
                label: "Bad action select",
                type: "select",
                options: ["approved", "rejected"],
                defaultValue: "missing",
              },
            ],
            asserts: { "case.status": "closed" },
          },
        ],
      };

      for (const source of [
        {
          extension: "json",
          serialize: (value: typeof config) => JSON.stringify(value, null, 2),
        },
        { extension: "yaml", serialize: stringifyYaml },
      ]) {
        const sourcePath = join(dir, `bad-defaults.${source.extension}`);
        await writeFile(sourcePath, source.serialize(config), "utf8");

        let stdout = "";
        let code: number | undefined;
        try {
          await runCli(["validate", "--output", "json", sourcePath]);
        } catch (error) {
          stdout = (error as { stdout?: string }).stdout ?? "";
          code = (error as { code?: number }).code;
        }
      const result = JSON.parse(stdout) as { valid: boolean; errors: string[] };

      expect(code).toBe(1);
      expect(result.valid).toBe(false);
      expect(result).toMatchObject({
        file: sourcePath,
        format: source.extension,
        sourceDigest: expect.stringMatching(/^cyrb53:/),
        diagnostics: expect.arrayContaining([
          expect.objectContaining({
            message: "form intake field bad_date_default defaultValue must be a string",
          }),
        ]),
      });
      expect(result.errors).toEqual(
        expect.arrayContaining([
            "form intake field bad_number_default defaultValue must be a number",
            "form intake field bad_boolean_default defaultValue must be a boolean",
            "form intake field bad_string_default defaultValue must be a string",
            "form intake field bad_date_default defaultValue must be a string",
            "form intake field bad_select_default defaultValue must be one of its options",
            "action close field bad_action_number defaultValue must be a number",
            "action close field bad_action_boolean defaultValue must be a boolean",
            "action close field bad_action_string defaultValue must be a string",
            "action close field bad_action_select defaultValue must be one of its options",
          ]),
        );
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("emits structured parse diagnostics for malformed JSON/YAML validate sources", async () => {
    const dir = await mkdtemp(join(tmpdir(), "account-config-parse-"));
    try {
      const sources = [
        {
          extension: "json",
          source: '{"account":',
          label: "JSON",
        },
        {
          extension: "yaml",
          source: "account: [",
          label: "YAML",
        },
      ];

      for (const invalidSource of sources) {
        const sourcePath = join(dir, `broken.${invalidSource.extension}`);
        await writeFile(sourcePath, invalidSource.source, "utf8");

        let stdout = "";
        let code: number | undefined;
        try {
          await runCli(["validate", "--output", "json", sourcePath]);
        } catch (error) {
          stdout = (error as { stdout?: string }).stdout ?? "";
          code = (error as { code?: number }).code;
        }
        const result = JSON.parse(stdout) as {
          valid: boolean;
          file: string;
          format: string;
          sourceDigest: string;
          errors: string[];
          diagnostics: Array<{ message: string }>;
        };

        expect(code).toBe(1);
        expect(result).toMatchObject({
          valid: false,
          file: sourcePath,
          format: invalidSource.extension,
          sourceDigest: expect.stringMatching(/^cyrb53:/),
        });
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain(
          `failed to read ${invalidSource.label} ${sourcePath}:`,
        );
        expect(result.diagnostics).toEqual([
          expect.objectContaining({ message: result.errors[0] }),
        ]);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps malformed JSON/YAML check-sources failures structured", async () => {
    const dir = await mkdtemp(join(tmpdir(), "account-config-check-parse-"));
    try {
      const brokenJson = join(dir, "broken.json");
      const brokenYaml = join(dir, "broken.yaml");
      await writeFile(brokenJson, '{"account":', "utf8");
      await writeFile(brokenYaml, "account: [", "utf8");

      let stdout = "";
      let code: number | undefined;
      try {
        await runCli(["check-sources", "--output", "json", dir]);
      } catch (error) {
        stdout = (error as { stdout?: string }).stdout ?? "";
        code = (error as { code?: number }).code;
      }
      const result = JSON.parse(stdout) as {
        valid: boolean;
        summary: {
          files: number;
          validFiles: number;
          invalidFiles: number;
          accounts: number;
          validAccounts: number;
        };
        files: Array<{
          file: string;
          format: string;
          valid: boolean;
          sourceDigest: string;
          errors: string[];
          diagnostics: Array<{ message: string }>;
        }>;
      };

      expect(code).toBe(1);
      expect(result).toMatchObject({
        valid: false,
        summary: {
          files: 2,
          validFiles: 0,
          invalidFiles: 2,
          accounts: 0,
          validAccounts: 0,
        },
      });
      expect(result.files).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            file: brokenJson,
            format: "json",
            valid: false,
            sourceDigest: expect.stringMatching(/^cyrb53:/),
            errors: [expect.stringContaining(`failed to read JSON ${brokenJson}:`)],
            diagnostics: [
              expect.objectContaining({
                message: expect.stringContaining(`failed to read JSON ${brokenJson}:`),
              }),
            ],
          }),
          expect.objectContaining({
            file: brokenYaml,
            format: "yaml",
            valid: false,
            sourceDigest: expect.stringMatching(/^cyrb53:/),
            errors: [expect.stringContaining(`failed to read YAML ${brokenYaml}:`)],
            diagnostics: [
              expect.objectContaining({
                message: expect.stringContaining(`failed to read YAML ${brokenYaml}:`),
              }),
            ],
          }),
        ]),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("emits source metadata for local artifact validation failures", async () => {
    const dir = await mkdtemp(join(tmpdir(), "account-config-artifact-invalid-"));
    try {
      const sourcePath = join(dir, "invalid.json");
      await writeFile(
        sourcePath,
        JSON.stringify(
          {
            account: { slug: "invalid-demo" },
            attributes: [],
          },
          null,
          2,
        ),
        "utf8",
      );

      for (const command of ["graph", "outline", "dump", "diff-deploy"] as const) {
        let stdout = "";
        let code: number | undefined;
        try {
          await runCli([command, "--output", "json", sourcePath]);
        } catch (error) {
          stdout = (error as { stdout?: string }).stdout ?? "";
          code = (error as { code?: number }).code;
        }
        const result = JSON.parse(stdout) as {
          valid: boolean;
          file: string;
          format: string;
          sourceDigest: string;
          errors: string[];
          diagnostics: Array<{ message: string }>;
        };

        expect(code).toBe(1);
        expect(result).toMatchObject({
          valid: false,
          file: sourcePath,
          format: "json",
          sourceDigest: expect.stringMatching(/^cyrb53:/),
          errors: ["account missing name"],
          diagnostics: [expect.objectContaining({ message: "account missing name" })],
        });
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects invalid YAML field defaults in checked-in source review", async () => {
    const dir = await mkdtemp(join(tmpdir(), "account-config-check-defaults-"));
    try {
      const sourcePath = join(dir, "bad-defaults.yaml");
      await writeFile(
        sourcePath,
        stringifyYaml({
          account: {
            slug: "default-demo",
            name: "Default Demo",
            kind: "custom",
          },
          attributes: [
            {
              name: "case.status",
              valueType: "string",
              cardinality: "one",
            },
          ],
          entityTypes: [{ name: "Case", attributes: ["case.status"] }],
          forms: [
            {
              form: "intake",
              title: "Intake",
              fields: [
                {
                  name: "bad_number_default",
                  label: "Bad number",
                  type: "number",
                  defaultValue: "high",
                },
                {
                  name: "bad_select_default",
                  label: "Bad select",
                  type: "select",
                  options: ["open", "closed"],
                  defaultValue: "missing",
                },
                {
                  name: "bad_date_default",
                  label: "Bad date",
                  type: "date",
                  defaultValue: false,
                },
              ],
            },
          ],
          actions: [
            {
              name: "close",
              appliesTo: "Case",
              fields: [
                {
                  name: "bad_action_boolean",
                  label: "Bad action boolean",
                  type: "boolean",
                  defaultValue: "true",
                },
              ],
              asserts: { "case.status": "closed" },
            },
          ],
        }),
        "utf8",
      );

      let stdout = "";
      let code: number | undefined;
      try {
        await runCli(["check-sources", "--output", "yaml", dir]);
      } catch (error) {
        stdout = (error as { stdout?: string }).stdout ?? "";
        code = (error as { code?: number }).code;
      }
      const result = parseYaml(stdout) as {
        valid: boolean;
        summary: {
          files: number;
          validFiles: number;
          invalidFiles: number;
          accounts: number;
          validAccounts: number;
          accountSummaries: Array<{
            accountSlug: string;
            files: number;
            valid: boolean;
            invalidFiles: number;
            formats: string[];
          }>;
        };
        files: Array<{ valid: boolean; errors: string[] }>;
      };

      expect(code).toBe(1);
      expect(result.valid).toBe(false);
      expect(result.summary).toMatchObject({
        files: 1,
        validFiles: 0,
        invalidFiles: 1,
        accounts: 1,
        validAccounts: 0,
        accountSummaries: [
          {
            accountSlug: "default-demo",
            files: 1,
            valid: false,
            invalidFiles: 1,
            formats: ["yaml"],
          },
        ],
      });
      expect(result.files).toHaveLength(1);
      expect(result.files[0]).toMatchObject({ valid: false });
      expect(result.files[0]?.errors).toEqual(
        expect.arrayContaining([
          "form intake field bad_number_default defaultValue must be a number",
          "form intake field bad_select_default defaultValue must be one of its options",
          "form intake field bad_date_default defaultValue must be a string",
          "action close field bad_action_boolean defaultValue must be a boolean",
        ]),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("checks checked-in sources as normalized deploy review artifacts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "account-config-sources-"));
    await Promise.all(
      ["forma", "json", "yaml"].map(async (extension) => {
        const source = await readFile(
          `configs/accounts/legal-workflows.${extension}`,
          "utf8",
        );
        await writeFile(join(dir, `legal-workflows.${extension}`), source, "utf8");
      }),
    );

    try {
      const { stdout } = await runCli(["check-sources", "--output", "json", dir]);
      const result = JSON.parse(stdout) as {
        valid: boolean;
        summary: {
          files: number;
          validFiles: number;
          invalidFiles: number;
          accounts: number;
          validAccounts: number;
          accountSummaries: Array<{
            accountSlug: string;
            files: number;
            valid: boolean;
            invalidFiles: number;
            formats: string[];
            artifactDigest: string | null;
            resourceGraphDigest: string | null;
            sourceOutlineDigest: string | null;
          }>;
        };
        files: Array<{
          file: string;
          format: string;
          valid: boolean;
          normalized?: boolean;
          accountSlug?: string;
          artifactDigest?: string;
          resourceGraph?: { digest: string; edgeCount: number };
          sourceOutline?: { digest: string; navigation: Array<{ label: string }> };
          plan?: { valid: boolean; empty: boolean; destructive: boolean };
          errors: string[];
        }>;
      };

      expect(result.valid).toBe(true);
      expect(result.summary).toMatchObject({
        files: 3,
        validFiles: 3,
        invalidFiles: 0,
        accounts: 1,
        validAccounts: 1,
        accountSummaries: [
          {
            accountSlug: "legal-workflows",
            files: 3,
            valid: true,
            invalidFiles: 0,
            formats: ["forma", "json", "yaml"],
            artifactDigest: expect.stringMatching(/^cyrb53:/),
            resourceGraphDigest: expect.stringMatching(/^cyrb53:/),
            sourceOutlineDigest: expect.stringMatching(/^cyrb53:/),
          },
        ],
      });
      const legalSources = result.files.filter(
        (file) => file.accountSlug === "legal-workflows",
      );

      expect(legalSources.map((file) => file.format).sort()).toEqual([
        "forma",
        "json",
        "yaml",
      ]);
      expect(new Set(legalSources.map((file) => file.artifactDigest)).size).toBe(1);
      expect(legalSources.every((file) => file.valid && file.errors.length === 0))
        .toBe(true);
      expect(
        legalSources
          .filter((file) => file.format === "forma")
          .every((file) => file.normalized === true),
      ).toBe(true);
      expect(legalSources[0]?.resourceGraph).toMatchObject({
        digest: expect.stringMatching(/^cyrb53:/),
        edgeCount: expect.any(Number),
      });
      expect(legalSources[0]?.sourceOutline?.navigation).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: "Flows: matter_intake" }),
        ]),
      );
      expect(legalSources[0]?.plan).toMatchObject({
        valid: true,
        empty: false,
        destructive: false,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("emits dump and idempotent diff review artifacts for checked-in Forma", async () => {
    const { stdout: normalizeStdout } = await runCli([
      "normalize-forma",
      "--check",
      "--output",
      "json",
      "configs/accounts/legal-workflows.forma",
    ]);
    expect(JSON.parse(normalizeStdout)).toEqual({
      normalized: true,
      file: "configs/accounts/legal-workflows.forma",
      sourceDigest: expect.stringMatching(/^cyrb53:/),
      normalizedDigest: expect.stringMatching(/^cyrb53:/),
      diff: {
        added: 0,
        removed: 0,
        sourceLines: expect.any(Number),
        normalizedLines: expect.any(Number),
      },
    });

    const { stdout: dumpStdout } = await runCli([
      "dump",
      "--output",
      "yaml",
      "configs/accounts/legal-workflows.forma",
    ]);
    const dump = parseYaml(dumpStdout) as {
      source: {
        account: { slug: string };
        digest: string;
        manifest: { forms: string[] };
      };
      prepared: {
        digest: string;
        artifact: { kind: string; manifest: { forms: string[] } };
      };
    };
    expect(dump.source.account.slug).toBe("legal-workflows");
    expect(dump.source.digest).toMatch(/^cyrb53:/);
    expect(dump.prepared.digest).toMatch(/^cyrb53:/);
    expect(dump.prepared.artifact).toMatchObject({
      kind: "metacrdt.account.deploy",
      manifest: { forms: ["conflict_check", "engagement_letter"] },
    });

    const dir = await mkdtemp(join(tmpdir(), "account-config-cli-"));
    try {
      const currentPath = join(dir, "current.deploy.json");
      await writeFile(currentPath, JSON.stringify(dump.prepared.artifact), "utf8");
      const { stdout: diffStdout } = await runCli([
        "diff-deploy",
        "--current",
        currentPath,
        "--output",
        "json",
        "configs/accounts/legal-workflows.forma",
      ]);
      const diff = JSON.parse(diffStdout) as {
        valid: boolean;
        empty: boolean;
        destructive: boolean;
        source: {
          file: string;
          format: string;
          account: { slug: string };
          digest: string;
          manifest: { forms: string[] };
        };
        prepared: { digest: string; manifest: { forms: string[] } };
        totals: Record<string, { added: number; changed: number; removed: number }>;
      };
      expect(diff).toMatchObject({
        valid: true,
        empty: true,
        destructive: false,
        source: {
          file: "configs/accounts/legal-workflows.forma",
          format: "forma",
          account: { slug: "legal-workflows" },
          digest: dump.source.digest,
          manifest: { forms: ["conflict_check", "engagement_letter"] },
        },
        prepared: {
          digest: dump.prepared.digest,
          manifest: { forms: ["conflict_check", "engagement_letter"] },
        },
      });
      expect(Object.values(diff.totals)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ added: 0, changed: 0, removed: 0 }),
        ]),
      );
      expect(
        Object.values(diff.totals).every(
          (total) => total.added === 0 && total.changed === 0 && total.removed === 0,
        ),
      ).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("emits source metadata for deployment tenant mismatch preflight failures", async () => {
    const dir = await mkdtemp(join(tmpdir(), "account-config-tenant-"));
    try {
      const sourcePath = join(dir, "legal-workflows.forma");
      await writeFile(
        sourcePath,
        `
(tenant legal-workflows "Legal Workflows" legal)
(form intake "Intake" (field ready boolean "Ready"))
`,
        "utf8",
      );

      let stdout = "";
      let code: number | undefined;
      try {
        await runCli([
          "plan-deploy",
          "--tenant",
          "acme-staffing",
          "--output",
          "json",
          sourcePath,
        ]);
      } catch (error) {
        stdout = (error as { stdout?: string }).stdout ?? "";
        code = (error as { code?: number }).code;
      }

      const message =
        "account slug legal-workflows does not match tenant acme-staffing";
      const result = JSON.parse(stdout) as {
        valid: boolean;
        file: string;
        format: string;
        sourceDigest: string;
        errors: string[];
        diagnostics: Array<{ message: string }>;
      };

      expect(code).toBe(1);
      expect(result).toMatchObject({
        valid: false,
        file: sourcePath,
        format: "forma",
        sourceDigest: expect.stringMatching(/^cyrb53:/),
        errors: [message],
        diagnostics: [{ message }],
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("emits normalization diff metadata for denormalized Forma checks", async () => {
    const dir = await mkdtemp(join(tmpdir(), "account-config-normalize-"));
    try {
      const sourcePath = join(dir, "denormalized.forma");
      await writeFile(
        sourcePath,
        '(tenant legal-workflows "Legal Workflows" legal)\n(form intake "Intake" (field ready boolean "Ready"))\n',
        "utf8",
      );

      let stdout = "";
      let code: number | undefined;
      try {
        await runCli(["normalize-forma", "--check", "--output", "json", sourcePath]);
      } catch (error) {
        stdout = (error as { stdout?: string }).stdout ?? "";
        code = (error as { code?: number }).code;
      }
      const result = JSON.parse(stdout) as {
        normalized: boolean;
        file: string;
        sourceDigest: string;
        normalizedDigest: string;
        diff: {
          added: number;
          removed: number;
          sourceLines: number;
          normalizedLines: number;
        };
      };

      expect(code).toBe(1);
      expect(result).toMatchObject({
        normalized: false,
        file: sourcePath,
        sourceDigest: expect.stringMatching(/^cyrb53:/),
        normalizedDigest: expect.stringMatching(/^cyrb53:/),
        diff: {
          added: expect.any(Number),
          removed: expect.any(Number),
          sourceLines: 2,
          normalizedLines: expect.any(Number),
        },
      });
      expect(result.normalizedDigest).not.toBe(result.sourceDigest);
      expect(result.diff.added + result.diff.removed).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
