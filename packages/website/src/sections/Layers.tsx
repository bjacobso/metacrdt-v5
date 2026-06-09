import { layerStack, layers } from "../content/copy";

export function Layers() {
  return (
    <section className="site-section section-rule border-b border-white/10" id="layers">
      <div className="section-inner">
        <p className="eyebrow">{layers.eyebrow}</p>
        <h2 className="section-title">{layers.title}</h2>
        <p className="section-copy mt-4">{layers.body}</p>
        <div className="stack-diagram mt-7" role="img" aria-label="MetaCRDT layer stack from Convex to Substrate, Engine, Emergence, and Products.">
          <pre>{layerStack}</pre>
        </div>
      </div>
    </section>
  );
}
