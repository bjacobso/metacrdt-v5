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
        <span>Examples</span>
        {!compact ? <h1>Compiler passes as evidence</h1> : <h2>Compiler passes as evidence</h2>}
      </div>
      <PipelineGrid />
    </section>
  );
}
