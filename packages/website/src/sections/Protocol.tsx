import { AsciiScene } from "../ascii/AsciiScene";
import { bitemporalScene, convergenceScene } from "../ascii/scenes";
import { protocol } from "../content/copy";

export function Protocol() {
  return (
    <section className="site-section section-rule border-b border-white/10" id="protocol">
      <div className="section-inner">
        <p className="eyebrow">{protocol.eyebrow}</p>
        <h2 className="section-title">{protocol.title}</h2>
        <div className="mt-5 grid gap-7 lg:grid-cols-[0.88fr_1.12fr]">
          <div>
            <p className="section-copy">{protocol.body}</p>
            <ul className="tight-list mt-6">
              {protocol.bullets.map((bullet) => (
                <li className="grid-card list-none p-3 font-mono text-xs leading-5 text-ink" key={bullet}>
                  {bullet}
                </li>
              ))}
            </ul>
          </div>
          <AsciiScene
            scene={convergenceScene}
            ariaLabel="Set union convergence animation showing two replicas converging to the same event set."
            caption="Replica logs merge by set union; duplicate EventIds dedupe and deterministic order sorts the projection."
          />
        </div>
        <div className="mt-7">
          <AsciiScene
            scene={bitemporalScene}
            ariaLabel="Bitemporal read animation showing transaction time and valid time axes."
            caption="A read coordinate asks what was known at one transaction time about one valid time."
          />
        </div>
      </div>
    </section>
  );
}
