import { conformance } from "../content/copy";

export function Conformance() {
  return (
    <section className="site-section section-rule border-b border-black/10" id="conformance">
      <div className="section-inner">
        <p className="eyebrow">{conformance.eyebrow}</p>
        <h2 className="section-title">{conformance.title}</h2>
        <div className="mt-7 grid gap-2.5">
          {conformance.levels.map((item, index) => (
            <article className="grid-card grid gap-2.5 p-3.5 md:grid-cols-[8.5rem_1fr]" key={item.level}>
              <div className="font-mono text-xs text-cyan-line">
                {String(index + 1).padStart(2, "0")} / {item.level}
              </div>
              <p className="m-0 text-sm text-muted">{item.requires}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
