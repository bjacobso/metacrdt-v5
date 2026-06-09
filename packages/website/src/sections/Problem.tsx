import { problem } from "../content/copy";

export function Problem() {
  return (
    <section className="site-section section-rule border-b border-black/10" id="problem">
      <div className="section-inner">
        <p className="eyebrow">{problem.eyebrow}</p>
        <h2 className="section-title">{problem.title}</h2>
        <p className="section-copy mt-4">{problem.body}</p>
        <div className="mt-7 grid gap-3 md:grid-cols-3">
          {problem.points.map((point, index) => (
            <div className="grid-card p-4" key={point}>
              <div className="paper-label mb-3">Claim {index + 1}</div>
              <p className="m-0 text-sm leading-6 text-ink">{point}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
