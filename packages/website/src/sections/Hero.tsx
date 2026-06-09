import { AsciiScene } from "../ascii/AsciiScene";
import { appendOnlyLogScene } from "../ascii/scenes";
import { hero, navLinks, sourceLinks } from "../content/copy";

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-black/10">
      <div className="section-inner flex min-h-[72vh] flex-col justify-between py-5">
        <nav className="paper-rule flex flex-wrap items-center justify-between gap-4 pt-4 font-mono text-xs">
          <a href="#" className="text-link font-bold">
            MetaCRDT
          </a>
          <div className="flex flex-wrap gap-3">
            {navLinks.map((link) => (
              <a className="nav-link" href={link.href} key={link.href}>
                {link.label}
              </a>
            ))}
          </div>
        </nav>

        <div className="grid items-center gap-10 py-10 lg:grid-cols-[0.98fr_1.02fr]">
          <div>
            <p className="eyebrow">{hero.eyebrow}</p>
            <h1 className="mt-4 font-serif text-[clamp(3.6rem,8vw,7.25rem)] font-medium leading-[0.9] tracking-normal">
              {hero.title}
            </h1>
            <ul className="paper-meta mt-4">
              {hero.meta.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="mt-7 max-w-2xl font-serif text-[clamp(1.18rem,2vw,1.55rem)] leading-snug text-ink">
              {hero.thesis}
            </p>
            <p className="section-copy mt-4">{hero.body}</p>
            <div className="mt-6 flex flex-wrap gap-3 font-mono text-xs">
              <a className="text-link" href={sourceLinks.protocol}>
                Specification
              </a>
              <a className="text-link" href={sourceLinks.specs}>
                Source docs
              </a>
              <a className="text-link" href={sourceLinks.repo}>
                Repository
              </a>
            </div>
          </div>
          <AsciiScene
            scene={appendOnlyLogScene}
            ariaLabel="Append-only event log animation showing immutable fact events docking into a growing log."
            caption="Events stream in, dock by content hash and HLC, and never rewrite older rows."
            controllable
          />
        </div>
        <div className="border-t border-black/10 py-3 font-mono text-[0.68rem] text-muted">
          Keywords: event-sourced CRDTs / bitemporal databases / deterministic derivation / operational provenance
        </div>
      </div>
    </section>
  );
}
