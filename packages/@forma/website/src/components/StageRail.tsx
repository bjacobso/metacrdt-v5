import { orderedStages, stageLabels, type StageKey } from "../pipelines/types";
import type { TimedPassResult } from "../engine/protocol";

interface StageRailProps {
  readonly activeStages: readonly StageKey[];
  readonly selectedStage: StageKey;
  readonly results: readonly TimedPassResult[];
  readonly stoppedAt?: StageKey | undefined;
  readonly onSelect: (stage: StageKey) => void;
}

export function StageRail({
  activeStages,
  selectedStage,
  results,
  stoppedAt,
  onSelect,
}: StageRailProps) {
  const active = new Set(activeStages);
  const resultByPass = new Map(results.map((result) => [result.pass, result]));
  const stoppedIndex = stoppedAt ? orderedStages.indexOf(stoppedAt) : -1;

  return (
    <div className="stage-rail" aria-label="Compiler pipeline stages">
      {orderedStages.map((stage, index) => {
        const enabled = active.has(stage);
        const result = stage === "source" || stage === "target" ? null : resultByPass.get(stage);
        const diagnosticCount = result?.diagnostics.length ?? 0;
        const downstreamStopped = stoppedIndex >= 0 && index > stoppedIndex;
        return (
          <button
            className={[
              "stage-chip",
              selectedStage === stage ? "stage-chip-selected" : "",
              enabled ? "" : "stage-chip-dim",
              downstreamStopped ? "stage-chip-stopped" : "",
            ].join(" ")}
            disabled={!enabled}
            key={stage}
            onClick={() => onSelect(stage)}
            type="button"
          >
            <span>{stageLabels[stage]}</span>
            {result ? <small>{Math.round(result.durationMs)}ms</small> : null}
            {diagnosticCount > 0 ? <b>{diagnosticCount}</b> : null}
          </button>
        );
      })}
    </div>
  );
}
