import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { LispEditor, type LispEditorRef } from "@forma/editor/react";
import type { EditorAnalysisHost, LispEditorIntelligence } from "@forma/editor";
import {
  parseFormaAccountConfigSource,
  type AccountConfigSourceDiagnostic,
} from "@metacrdt/account-config";
import {
  COMPACT_FORMA_SNIPPETS,
  formaCompletionSuggestions,
  type AccountConfigSourceFormat,
} from "./configSource";

export type AccountConfigSourceEditorProps = {
  value: string;
  format?: AccountConfigSourceFormat | null;
  rows?: number;
  readOnly?: boolean;
  onChange: (value: string) => void;
};

export type AccountConfigSourceEditorHandle = {
  focus: () => void;
  focusLine: (line: number) => void;
  insertText: (text: string) => void;
};

function lineNumbers(value: string): number[] {
  const count = Math.max(1, value.split("\n").length);
  return Array.from({ length: count }, (_, index) => index + 1);
}

function lineSelectionRange(source: string, line: number): [number, number] {
  const lines = source.split("\n");
  const targetLine = Math.max(1, Math.min(line, lines.length));
  let start = 0;
  for (let index = 0; index < targetLine - 1; index++) {
    start += lines[index]!.length + 1;
  }
  const end = start + lines[targetLine - 1]!.length;
  return [start, end];
}

function insertion(
  source: string,
  start: number,
  end: number,
  text: string,
): { next: string; cursor: number } {
  const before = source.slice(0, start);
  const after = source.slice(end);
  const prefix = before === "" || before.endsWith("\n") ? "" : "\n";
  const suffix = after === "" || after.startsWith("\n") ? "" : "\n";
  const next = `${before}${prefix}${text}${suffix}${after}`;
  return { next, cursor: before.length + prefix.length + text.length };
}

function offsetAtLineCol(source: string, line: number, col: number): number {
  let offset = 0;
  const lines = source.split("\n");
  const targetLine = Math.max(1, Math.min(line, lines.length));
  for (let index = 0; index < targetLine - 1; index++) {
    offset += lines[index]!.length + 1;
  }
  return Math.min(source.length, offset + Math.max(0, col - 1));
}

function wordRangeAt(source: string, offset: number): { from: number; to: number } {
  const word = /[\w!?*+/<>=$.&:-]/;
  let from = Math.max(0, Math.min(offset, source.length));
  let to = from;
  if (from > 0 && !word.test(source[from] ?? "") && word.test(source[from - 1]!)) {
    from -= 1;
    to = from + 1;
  }
  while (from > 0 && word.test(source[from - 1]!)) from -= 1;
  while (to < source.length && word.test(source[to]!)) to += 1;
  return { from, to: Math.max(to, from + 1) };
}

function diagnosticLoc(diagnostic: AccountConfigSourceDiagnostic) {
  return diagnostic.loc
    ? { line: diagnostic.loc.line, col: diagnostic.loc.col }
    : undefined;
}

function formaTokenRanges(source: string, names: readonly string[], cls: string) {
  const ranges: { from: number; to: number; cls: string }[] = [];
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matcher = new RegExp(`(?<![\\w.:-])${escaped}(?![\\w.:-])`, "g");
    for (let match = matcher.exec(source); match !== null; match = matcher.exec(source)) {
      ranges.push({
        from: match.index,
        to: match.index + match[0].length,
        cls,
      });
    }
  }
  return ranges;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function list(config: unknown, key: string): unknown[] {
  const value = record(config)[key];
  return Array.isArray(value) ? value : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function namedResourceHover(config: unknown, token: string): string | null {
  for (const raw of list(config, "attributes")) {
    const entry = record(raw);
    if (entry.name !== token) continue;
    const type = typeof entry.valueType === "string" ? entry.valueType : "unknown";
    const cardinality = typeof entry.cardinality === "string" ? entry.cardinality : "one";
    return `Attribute ${token}: ${type}, ${cardinality}`;
  }
  for (const raw of list(config, "entityTypes")) {
    const entry = record(raw);
    if (entry.name !== token) continue;
    return `Entity ${token}: ${strings(entry.attributes).length} attributes`;
  }
  for (const raw of list(config, "forms")) {
    const entry = record(raw);
    if (entry.form !== token) continue;
    const fields = Array.isArray(entry.fields) ? entry.fields.length : 0;
    const title = typeof entry.title === "string" ? ` - ${entry.title}` : "";
    return `Form ${token}: ${fields} fields${title}`;
  }
  for (const raw of list(config, "flows")) {
    const entry = record(raw);
    if (entry.name !== token) continue;
    const steps = Array.isArray(entry.steps) ? entry.steps.length : 0;
    const subject =
      typeof entry.subjectType === "string" ? ` for ${entry.subjectType}` : "";
    return `Flow ${token}${subject}: ${steps} steps`;
  }
  for (const raw of list(config, "actions")) {
    const entry = record(raw);
    if (entry.name !== token) continue;
    const appliesTo =
      typeof entry.appliesTo === "string" ? ` for ${entry.appliesTo}` : "";
    const assertions = Object.keys(record(entry.asserts)).length;
    return `Action ${token}${appliesTo}: ${assertions} assertions`;
  }
  return null;
}

export function accountConfigFormaIntelligence(): LispEditorIntelligence {
  return {
    diagnostics: {
      getDiagnostics(source) {
        return parseFormaAccountConfigSource(source).diagnostics.map((diagnostic) => ({
          severity: "error",
          message: diagnostic.path
            ? `${diagnostic.path}: ${diagnostic.message}`
            : diagnostic.message,
          loc: diagnosticLoc(diagnostic),
        }));
      },
    },
    completion: {
      getCompletions(source, offset) {
        const parsed = parseFormaAccountConfigSource(source);
        const config = parsed.config;
        const options = [
          ...COMPACT_FORMA_SNIPPETS.map((snippet) => ({
            label: snippet.label,
            type: "snippet",
            apply: snippet.source,
            detail: "template",
          })),
          ...(config === null ? [] : formaCompletionSuggestions(config)).map((suggestion) => ({
            label: suggestion.label,
            type: suggestion.sourceAware ? "property" : "snippet",
            apply: suggestion.source,
            detail: suggestion.detail,
          })),
        ];
        return { from: wordRangeAt(source, offset).from, options };
      },
    },
    hover: {
      getHover(source, offset) {
        const parsed = parseFormaAccountConfigSource(source);
        if (parsed.config === null) {
          const diagnostic = parsed.diagnostics.find((entry) => {
            if (!entry.loc) return false;
            const position = offsetAtLineCol(source, entry.loc.line, entry.loc.col);
            const range = wordRangeAt(source, position);
            return range.from <= offset && offset <= range.to;
          });
          if (diagnostic) {
            const position = offsetAtLineCol(source, diagnostic.loc!.line, diagnostic.loc!.col);
            const range = wordRangeAt(source, position);
            return { content: diagnostic.message, range: { start: range.from, end: range.to } };
          }
        }
        const range = wordRangeAt(source, offset);
        const token = source.slice(range.from, range.to);
        const config = parsed.config;
        if (config !== null) {
          const resourceHover = namedResourceHover(config, token);
          if (resourceHover !== null) {
            return {
              content: resourceHover,
              range: { start: range.from, end: range.to },
            };
          }
          const completions = formaCompletionSuggestions(config);
          const match = completions.find((entry) => entry.source.includes(token));
          if (match) {
            return {
              content: `${match.label}: ${match.detail}`,
              range: { start: range.from, end: range.to },
            };
          }
        }
        return null;
      },
    },
    semanticHighlight: {
      getRanges(source) {
        const parsed = parseFormaAccountConfigSource(source);
        if (parsed.config === null) return [];
        const config = parsed.config as Record<string, unknown>;
        const list = (key: string) => (Array.isArray(config[key]) ? config[key] : []);
        const names = (key: string, field: string) =>
          list(key)
            .map((entry) =>
              entry !== null && typeof entry === "object"
                ? (entry as Record<string, unknown>)[field]
                : undefined,
            )
            .filter((value): value is string => typeof value === "string" && value !== "");
        return [
          ...formaTokenRanges(source, names("attributes", "name"), "cm-account-attribute"),
          ...formaTokenRanges(source, names("entityTypes", "name"), "cm-account-entity"),
          ...formaTokenRanges(source, names("forms", "form"), "cm-account-form"),
          ...formaTokenRanges(source, names("flows", "name"), "cm-account-flow"),
          ...formaTokenRanges(source, names("actions", "name"), "cm-account-action"),
        ];
      },
    },
  };
}

const accountConfigEditorHost: EditorAnalysisHost = {
  async analyzeEditor(request) {
    return {
      sourceId: request.sourceId ?? "account-config-forma",
      success: true,
      typedSpans: [],
      errors: [],
      diagnostics: [],
      parse: { errors: [], greenTree: null, redTree: null },
    };
  },
  findTypeAtOffset() {
    return undefined;
  },
};

export const AccountConfigSourceEditor = forwardRef<
  AccountConfigSourceEditorHandle,
  AccountConfigSourceEditorProps
>(function AccountConfigSourceEditor(
  { value, format = null, rows = 22, readOnly = false, onChange },
  ref,
) {
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const lispEditorRef = useRef<LispEditorRef | null>(null);
  const intelligence = useMemo(() => accountConfigFormaIntelligence(), []);

  useImperativeHandle(
    ref,
    () => ({
      focus() {
        if (format === "forma") {
          lispEditorRef.current?.getEditor()?.focus();
          return;
        }
        textAreaRef.current?.focus();
      },
      focusLine(line) {
        if (format === "forma") {
          lispEditorRef.current?.revealLine(line);
          return;
        }
        const textArea = textAreaRef.current;
        if (textArea === null) return;
        const [start, end] = lineSelectionRange(value, line);
        textArea.focus();
        textArea.setSelectionRange(start, end);
      },
      insertText(text) {
        if (readOnly) return;
        if (format === "forma") {
          const view = lispEditorRef.current?.getEditor();
          if (view) {
            const selection = view.state.selection.main;
            const current = view.state.doc.toString();
            const { next, cursor } = insertion(current, selection.from, selection.to, text);
            view.dispatch({
              changes: { from: 0, to: current.length, insert: next },
              selection: { anchor: cursor },
            });
            view.focus();
            return;
          }
        }
        const textArea = textAreaRef.current;
        if (textArea === null) {
          onChange(`${value.trimEnd()}\n${text}`);
          return;
        }
        const { next, cursor } = insertion(value, textArea.selectionStart, textArea.selectionEnd, text);
        onChange(next);
        window.requestAnimationFrame(() => {
          textArea.focus();
          textArea.setSelectionRange(cursor, cursor);
        });
      },
    }),
    [format, onChange, readOnly, value],
  );

  if (format === "forma") {
    return (
      <div
        data-account-config-editor="forma"
        role="group"
        aria-label="Forma account config source"
        className="overflow-hidden rounded-md border border-line bg-brand font-mono text-[12px] focus-within:ring-2 focus-within:ring-line"
      >
        <LispEditor
          ref={lispEditorRef}
          value={value}
          onChange={readOnly ? () => undefined : onChange}
          readOnly={readOnly}
          minHeight={448}
          maxHeight={736}
          lineNumbers
          theme="app-dark"
          showStatusBar={false}
          intelligence={intelligence}
          editorHost={accountConfigEditorHost}
          ariaLabel="Forma account config source"
        />
      </div>
    );
  }

  return (
    <div
      data-account-config-editor="plain"
      className="grid max-h-[46rem] grid-cols-[3.25rem_minmax(0,1fr)] overflow-hidden rounded-md border border-line bg-canvas font-mono text-[12px] text-ink focus-within:ring-2 focus-within:ring-line"
    >
      <div
        aria-hidden="true"
        className="select-none overflow-hidden border-r border-line-soft bg-surface px-2 py-3 text-right leading-5 text-faint"
      >
        {lineNumbers(value).map((line) => (
          <div key={line} className="h-5">
            {line}
          </div>
        ))}
      </div>
      <textarea
        ref={textAreaRef}
        value={value}
        rows={rows}
        readOnly={readOnly}
        spellCheck={false}
        onChange={(event) => {
          if (!readOnly) onChange(event.currentTarget.value);
        }}
        className="min-h-[28rem] w-full resize-y border-0 bg-canvas p-3 leading-5 text-ink outline-none read-only:cursor-default"
      />
    </div>
  );
});
