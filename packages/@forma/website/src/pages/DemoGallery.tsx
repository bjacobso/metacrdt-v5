import { PipelineGrid } from "../components/PipelineGrid";
import { useDocumentMeta } from "../lib/documentMeta";

export function DemoGallery({ compact = false }: { readonly compact?: boolean }) {
  useDocumentMeta({
    title: "Forma Pipeline Gallery",
    description: "Choose a Forma compiler pipeline and inspect each pass from source to output.",
  });

  return (
    <section className={compact ? "gallery gallery-compact" : "gallery"}>
      <div className="section-heading">
        <span>Pipeline gallery</span>
        {!compact ? <h1>Choose a pass to inspect</h1> : <h2>Proof by pipeline</h2>}
      </div>
      <PipelineGrid />
    </section>
  );
}
