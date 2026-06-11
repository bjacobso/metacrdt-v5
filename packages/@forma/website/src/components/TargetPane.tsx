import type { PipelinePreview } from "../pipelines/types";
import { TargetCodeView } from "./TargetCodeView";

export function TargetPane({ preview }: { readonly preview: PipelinePreview | undefined }) {
  if (!preview) return <p className="empty-state">No target configured for this pipeline.</p>;
  return (
    <div className="target-pane">
      <div className="preview-banner">
        <strong>PREVIEW</strong>
        <span>{preview.notice ?? "This target fixture is checked in; the earlier live passes ran in this tab."}</span>
      </div>
      <div className="pane-heading">
        <span>{preview.targetLabel}</span>
        <code>{preview.language}</code>
      </div>
      <TargetCodeView code={preview.output} language={preview.language} />
    </div>
  );
}
