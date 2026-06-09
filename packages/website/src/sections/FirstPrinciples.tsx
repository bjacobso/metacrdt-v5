import { AsciiScene } from "../ascii/AsciiScene";
import { foldScene } from "../ascii/scenes";
import { firstPrinciples } from "../content/copy";

export function FirstPrinciples() {
  return (
    <section className="site-section section-rule border-b border-black/10" id="principles">
      <div className="section-inner">
        <p className="eyebrow">{firstPrinciples.eyebrow}</p>
        <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr]">
          <div>
            <h2 className="section-title">{firstPrinciples.title}</h2>
            <p className="section-copy mt-4">{firstPrinciples.body}</p>
          </div>
          <AsciiScene
            scene={foldScene}
            ariaLabel="State is a fold animation showing an event log producing a current state object."
            caption="The fold head walks the immutable log; the right side is computed output."
          />
        </div>
        <div className="mt-7 grid gap-3 md:grid-cols-2">
          {firstPrinciples.properties.map((property) => (
            <article className="grid-card p-4" key={property.name}>
              <h3 className="m-0 font-mono text-sm text-green-line">{property.name}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{property.meaning}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
