import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";
import type { StageKey } from "../pipelines/types";

export interface DemoUrlState {
  readonly step: number | null;
  readonly source: string | null;
  readonly selectedOffset: number | null;
}

export function readDemoUrlState(search: URLSearchParams): DemoUrlState {
  const stepValue = search.get("step");
  const selValue = search.get("sel");
  const encodedSource = search.get("src");
  return {
    step: stepValue === null ? null : numberOrNull(stepValue),
    selectedOffset: selValue === null ? null : numberOrNull(selValue),
    source: encodedSource ? (decompressFromEncodedURIComponent(encodedSource) ?? null) : null,
  };
}

export function writeDemoUrlState(
  path: string,
  state: {
    readonly step?: number | null;
    readonly source?: string | null;
    readonly presetSource: string;
    readonly selectedStage?: StageKey | null;
    readonly selectedOffset?: number | null;
    readonly embed?: boolean;
  },
): void {
  const params = new URLSearchParams();
  if (state.embed) {
    params.set("embed", "1");
  }
  if (state.step !== undefined && state.step !== null) {
    params.set("step", String(state.step));
  }
  if (state.source !== undefined && state.source !== null && state.source !== state.presetSource) {
    params.set("src", compressToEncodedURIComponent(state.source));
  }
  if (state.selectedOffset !== undefined && state.selectedOffset !== null) {
    params.set("sel", String(state.selectedOffset));
  }
  const query = params.toString();
  window.history.replaceState(null, "", query ? `${path}?${query}` : path);
}

function numberOrNull(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
