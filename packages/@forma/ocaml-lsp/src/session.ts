import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import type { TextDocument } from "vscode-languageserver-textdocument";

import { OcamlAbiClient, repoPath } from "./abi.js";
import type { AbiDiagnostic, AbiResponse, CstExpr, SymbolDefinition } from "./protocol.js";
import { asCstExprArray, isRecord, readNestedString } from "./protocol.js";
import { collectDefinitions } from "./symbols.js";

export interface OcamlWorkspaceSessionOptions {
  readonly workspaceRoot?: string;
  readonly artifactPath?: string;
  readonly preludeNames?: readonly string[];
}

export interface AnalysisResult {
  readonly response: AbiResponse;
  readonly diagnostics: readonly AbiDiagnostic[];
}

const defaultPreludeNames = [
  "kernel.lisp",
  "compiler.lisp",
  "ontology.lisp",
  "viewspec-protocol.lisp",
  "viewspec.lisp",
  "ontology-compiler.lisp",
  "viewspec-compiler.lisp",
];

export class OcamlWorkspaceSession {
  readonly workspaceRoot: string;
  readonly documents = new Map<string, TextDocument>();

  private readonly parsedDocuments = new Map<string, readonly CstExpr[]>();
  private readonly preludeNames: readonly string[];
  private client: OcamlAbiClient | undefined;
  private sessionId: string | undefined;
  private opening: Promise<void> | undefined;

  constructor(private readonly options: OcamlWorkspaceSessionOptions = {}) {
    this.workspaceRoot = options.workspaceRoot ?? process.cwd();
    this.preludeNames = options.preludeNames ?? readPreludeNamesFromEnv() ?? defaultPreludeNames;
  }

  async open(): Promise<void> {
    if (this.opening) {
      await this.opening;
      return;
    }

    this.opening = this.openFresh();
    await this.opening;
  }

  async close(): Promise<void> {
    if (this.client && this.sessionId) {
      await this.client
        .request({ op: "closeSession", sessionId: this.sessionId })
        .catch(() => undefined);
    }
    await this.client?.close();
    this.client = undefined;
    this.sessionId = undefined;
    this.opening = undefined;
  }

  async updateDocument(document: TextDocument): Promise<AnalysisResult> {
    this.documents.set(document.uri, document);
    await this.open();

    const sourceId = sourceIdForUri(document.uri);
    const source = document.getText();
    const loadResponse = await this.request({
      op: "loadSource",
      sessionId: this.currentSessionId(),
      sourceId,
      source,
    });

    if (loadResponse.ok !== true) {
      return {
        response: loadResponse,
        diagnostics: loadResponse.diagnostics ?? [],
      };
    }

    const typecheckResponse = await this.editorAnalyze(document);
    return {
      response: typecheckResponse,
      diagnostics: editorDiagnostics(typecheckResponse),
    };
  }

  forgetDocument(uri: string): void {
    this.documents.delete(uri);
    this.parsedDocuments.delete(uri);
  }

  async parseDocument(document: TextDocument): Promise<readonly CstExpr[]> {
    const response = await this.request({
      op: "parseAst",
      sourceId: sourceIdForUri(document.uri),
      source: document.getText(),
    });
    if (response.ok !== true) return [];
    return asCstExprArray(response.value);
  }

  async parsedDocument(document: TextDocument): Promise<readonly CstExpr[]> {
    const cached = this.parsedDocuments.get(document.uri);
    if (cached) return cached;
    const parsed = await this.parseDocument(document);
    this.parsedDocuments.set(document.uri, parsed);
    return parsed;
  }

  async typecheckSource(sourceId: string, source: string): Promise<AbiResponse> {
    return await this.request({
      op: "typecheck",
      sessionId: this.currentSessionId(),
      sourceId,
      source,
    });
  }

  async editorAnalyze(document: TextDocument): Promise<AbiResponse> {
    await this.open();
    return await this.request({
      op: "editorAnalyze",
      sessionId: this.currentSessionId(),
      sourceId: sourceIdForUri(document.uri),
    });
  }

  async editorHover(document: TextDocument, offset: number): Promise<AbiResponse> {
    await this.open();
    return await this.request({
      op: "editorHover",
      sessionId: this.currentSessionId(),
      sourceId: sourceIdForUri(document.uri),
      offset,
    });
  }

  async editorCompletion(document: TextDocument, offset: number): Promise<AbiResponse> {
    await this.open();
    return await this.request({
      op: "editorCompletion",
      sessionId: this.currentSessionId(),
      sourceId: sourceIdForUri(document.uri),
      offset,
    });
  }

  async editorDefinition(document: TextDocument, offset: number): Promise<AbiResponse> {
    await this.open();
    return await this.request({
      op: "editorDefinition",
      sessionId: this.currentSessionId(),
      sourceId: sourceIdForUri(document.uri),
      offset,
    });
  }

  async editorFormat(document: TextDocument): Promise<AbiResponse> {
    await this.open();
    return await this.request({
      op: "editorFormat",
      sessionId: this.currentSessionId(),
      sourceId: sourceIdForUri(document.uri),
    });
  }

  allDefinitions(): readonly SymbolDefinition[] {
    return [...this.parsedDocuments.entries()].flatMap(([uri, exprs]) =>
      collectDefinitions(uri, exprs),
    );
  }

  private async openFresh(): Promise<void> {
    this.client = await OcamlAbiClient.create(
      this.options.artifactPath ? { artifactPath: this.options.artifactPath } : {},
    );
    const opened = await this.client.request({ op: "openSession" });
    const sessionId = readNestedString(opened, ["value", "sessionId"]);
    if (!sessionId) {
      throw new Error(`openSession did not return a sessionId: ${JSON.stringify(opened)}`);
    }
    this.sessionId = sessionId;
    await this.loadPreludes();
  }

  private async loadPreludes(): Promise<void> {
    for (const name of this.preludeNames) {
      const sourcePath = resolve(repoPath("preludes"), name);
      const source = await readFile(sourcePath, "utf8");
      const response = await this.request({
        op: "loadPrelude",
        sessionId: this.currentSessionId(),
        sourceId: `preludes/${basename(name)}`,
        source,
      });
      if (response.ok !== true) {
        throw new Error(`loadPrelude ${name} failed: ${JSON.stringify(response)}`);
      }
    }
  }

  private async request(payload: Parameters<OcamlAbiClient["request"]>[0]): Promise<AbiResponse> {
    if (!this.client) {
      throw new Error("OCaml ABI session is not open");
    }
    return await this.client.request(payload);
  }

  private currentSessionId(): string {
    if (!this.sessionId) {
      throw new Error("OCaml ABI session is not open");
    }
    return this.sessionId;
  }
}

export function sourceIdForUri(uri: string): string {
  if (uri.startsWith("file://")) {
    try {
      return decodeURIComponent(new URL(uri).pathname).replace(/^\//, "");
    } catch {
      return uri;
    }
  }
  return uri;
}

function readPreludeNamesFromEnv(): readonly string[] | undefined {
  const raw = process.env["OPEN_ONTOLOGY_OCAML_LSP_PRELUDES"];
  if (raw === undefined) return undefined;
  if (raw.trim() === "" || raw === "0" || raw.toLowerCase() === "none") return [];
  return raw
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

export function diagnosticMessages(response: AbiResponse): readonly string[] {
  if (!Array.isArray(response.diagnostics)) return [];
  return response.diagnostics
    .map((diagnostic) => (isRecord(diagnostic) ? diagnostic["message"] : undefined))
    .filter((message): message is string => typeof message === "string");
}

export function editorValue(response: AbiResponse): Record<string, unknown> {
  return isRecord(response.value) ? response.value : {};
}

export function editorDiagnostics(response: AbiResponse): readonly AbiDiagnostic[] {
  const value = editorValue(response);
  return Array.isArray(value["diagnostics"])
    ? (value["diagnostics"] as readonly AbiDiagnostic[])
    : (response.diagnostics ?? []);
}
