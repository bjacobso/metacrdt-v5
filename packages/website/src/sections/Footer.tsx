import { footer, sourceLinks } from "../content/copy";

export function Footer() {
  return (
    <footer className="site-section section-rule" id="footer">
      <div className="section-inner grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <p className="eyebrow">{footer.label}</p>
          <p className="section-copy mt-3">{footer.text}</p>
        </div>
        <div className="flex flex-wrap gap-3 font-mono text-xs">
          <a className="text-link" href={sourceLinks.repo}>
            repository
          </a>
          <a className="text-link" href={sourceLinks.specs}>
            source docs
          </a>
          <a className="text-link" href={sourceLinks.protocol}>
            specification
          </a>
        </div>
      </div>
    </footer>
  );
}
