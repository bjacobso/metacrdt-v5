import { AsciiScene } from "../ascii/AsciiScene";
import { appendOnlyLogScene } from "../ascii/scenes";
import { hero, navLinks, sourceLinks } from "../content/copy";

export function Hero() {
  return (
    <section className="relative min-h-[82vh] overflow-hidden border-b border-white/10">
      <div className="section-inner flex min-h-[82vh] flex-col justify-between py-5">
        <nav className="flex flex-wrap items-center justify-between gap-4 font-mono text-xs">
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

        <div className="grid items-center gap-8 py-10 lg:grid-cols-[0.92fr_1.08fr]">
          <div>
            <p className="eyebrow">{hero.eyebrow}</p>
            <h1 className="mt-4 text-[clamp(4rem,10vw,8.5rem)] font-black leading-[0.86] tracking-normal">
              {hero.title}
            </h1>
            <p className="mt-6 max-w-2xl text-[clamp(1.12rem,2vw,1.68rem)] leading-tight text-ink">
              {hero.thesis}
            </p>
            <p className="section-copy mt-4">{hero.body}</p>
            <div className="mt-6 flex flex-wrap gap-3 font-mono text-xs">
              <a className="text-link" href={sourceLinks.protocol}>
                Protocol spec
              </a>
              <a className="text-link" href={sourceLinks.specs}>
                Specs
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
        <div className="border-t border-white/10 py-3 font-mono text-[0.68rem] text-muted">
          append-only events | deterministic fold | bitemporal reads | derivation as projection
        </div>
      </div>
    </section>
  );
}
