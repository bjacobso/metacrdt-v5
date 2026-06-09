import { status } from "../content/copy";

export function Status() {
  return (
    <section className="site-section section-rule border-b border-white/10" id="status">
      <div className="section-inner">
        <p className="eyebrow">{status.eyebrow}</p>
        <h2 className="section-title">{status.title}</h2>
        <div className="mt-7 grid gap-4 lg:grid-cols-2">
          <StatusList title="Built" items={status.built} tone="text-green-line" />
          <StatusList title="Frontier" items={status.frontier} tone="text-amber-line" />
        </div>
      </div>
    </section>
  );
}

function StatusList({ title, items, tone }: { title: string; items: readonly string[]; tone: string }) {
  return (
    <article className="grid-card p-4">
      <h3 className={`m-0 font-mono text-base ${tone}`}>{title}</h3>
      <ul className="mt-3 p-0">
        {items.map((item) => (
          <li className="list-none border-t border-white/10 py-2.5 text-sm leading-5 text-muted" key={item}>
            {item}
          </li>
        ))}
      </ul>
    </article>
  );
}
