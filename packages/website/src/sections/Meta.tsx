import { AsciiScene } from "../ascii/AsciiScene";
import { derivationScene } from "../ascii/scenes";
import { meta } from "../content/copy";

export function Meta() {
  return (
    <section className="site-section section-rule border-b border-black/10" id="meta">
      <div className="section-inner grid gap-8 lg:grid-cols-[0.88fr_1.12fr]">
        <div>
          <p className="eyebrow">{meta.eyebrow}</p>
          <h2 className="section-title">{meta.title}</h2>
          <p className="section-copy mt-4">{meta.body}</p>
          <p className="mt-6 max-w-sm border-l border-black/20 pl-4 font-serif text-lg leading-7 text-amber-line">
            {meta.tagline}
          </p>
        </div>
        <AsciiScene
          scene={derivationScene}
          ariaLabel="Derivation converges animation showing events folding into derived facts, obligations, workflow runs, and views."
          caption="Derived layers recompute from the same event set instead of synchronizing separate state."
        />
      </div>
    </section>
  );
}
