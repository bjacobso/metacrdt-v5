import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { PipelineDef } from "../pipelines/types";
import { InlineGlossaryText } from "./Dfn";

export function NarrationCard({
  pipeline,
  step,
  onStep,
  onClose,
}: {
  readonly pipeline: PipelineDef;
  readonly step: number | null;
  readonly onStep: (step: number) => void;
  readonly onClose: () => void;
}) {
  if (step === null) return null;
  const bounded = Math.max(0, Math.min(step, pipeline.narration.length - 1));
  const item = pipeline.narration[bounded];
  if (!item) return null;
  return (
    <aside className="narration-card">
      <div className="narration-meta">
        <span>
          Step {bounded + 1} of {pipeline.narration.length}
        </span>
        <button aria-label="Close tour" onClick={onClose} type="button">
          <X size={16} />
        </button>
      </div>
      <p>
        <InlineGlossaryText text={item.md} />
      </p>
      <div className="narration-actions">
        <button disabled={bounded === 0} onClick={() => onStep(bounded - 1)} type="button">
          <ChevronLeft size={16} />
          Prev
        </button>
        <button
          disabled={bounded === pipeline.narration.length - 1}
          onClick={() => onStep(bounded + 1)}
          type="button"
        >
          Next
          <ChevronRight size={16} />
        </button>
      </div>
    </aside>
  );
}
