import { Link } from "react-router-dom";
import { Dfn } from "../components/Dfn";
import { PipelineGrid } from "../components/PipelineGrid";
import { useDocumentMeta } from "../lib/documentMeta";

export function Home() {
  useDocumentMeta({
    title: "Forma",
    description:
      "Forma is a small typed language that compiles into the systems you already use. Watch every compiler pass happen.",
  });

  return (
    <main>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Working note</span>
          <h1>Forma</h1>
          <p>
            A small Lisp-shaped language for writing programs that can be checked, run, or
            elaborated into typed target artifacts.
          </p>
          <div className="hero-actions">
            <Link className="primary-action" to="/demo/hello">
              Demo
            </Link>
            <a
              className="secondary-action"
              href="https://github.com/bjacobso/convex-triples"
              rel="noreferrer"
              target="_blank"
            >
              Repository
            </a>
          </div>
        </div>
        <pre className="hero-transcript">{`source      (* rate hours)
read        (list * rate hours)
type        Number
evaluate    {:revenue 6000}`}</pre>
      </section>

      <section className="claim-row">
        <Link to="/demo/pipes">Operators are libraries</Link>
        <Link to="/demo/types">Types without writing types</Link>
        <Link to="/demo/effect-schema">Schemas become validators</Link>
      </section>

      <section className="gallery gallery-compact">
        <div className="section-heading">
          <span>Examples</span>
          <h2>Compiler passes as evidence</h2>
        </div>
        <PipelineGrid />
      </section>

      <section className="story-band">
        <h2>Abstract</h2>
        <p>
          Forma treats compiler passes as product surface. Instead of asking you to trust that a
          {" "}
          <Dfn term="macro">macro</Dfn>, type checker, or target backend did the right thing, it exposes
          the artifact at each stage.
        </p>
        <p>
          That makes <Dfn term="elaboration">elaboration</Dfn> concrete: a program can evaluate to
          a value, or it can elaborate into a description another system executes. The demo keeps
          both cases visible.
        </p>
        <p>
          This is a research project and APIs are unstable, but the live passes in the demo run in
          the browser from the same monorepo engine.
        </p>
      </section>

      <footer className="site-footer">
        <span>Research project. APIs unstable.</span>
        <nav>
          <Link to="/about">About</Link>
          <a href="https://github.com/bjacobso/convex-triples" rel="noreferrer" target="_blank">
            GitHub
          </a>
        </nav>
      </footer>
    </main>
  );
}
