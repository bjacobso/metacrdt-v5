import { ArrowRight, Code } from "lucide-react";
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
          <span className="eyebrow">Forma</span>
          <h1>A small typed language that compiles into the systems you already use.</h1>
          <p>Source goes in, typed structure comes out, and every arrow is inspectable.</p>
          <div className="hero-actions">
            <Link className="primary-action" to="/demo/hello">
              Try the demo
              <ArrowRight size={18} />
            </Link>
            <a
              className="secondary-action"
              href="https://github.com/bjacobso/convex-triples"
              rel="noreferrer"
              target="_blank"
            >
              <Code size={18} />
              GitHub
            </a>
          </div>
        </div>
        <div className="hero-pipeline" aria-label="Animated compiler pipeline">
          <div className="hero-stage stage-a">
            <b>source</b>
            <code>(* rate hours)</code>
          </div>
          <div className="hero-stage stage-b">
            <b>read</b>
            <code>(list * rate hours)</code>
          </div>
          <div className="hero-stage stage-c">
            <b>type</b>
            <code>Number</code>
          </div>
          <div className="hero-stage stage-d">
            <b>value</b>
            <code>{`{:revenue 6000}`}</code>
          </div>
        </div>
      </section>

      <section className="claim-row">
        <Link to="/demo/pipes">
          <span>Operators are libraries</span>
          <ArrowRight size={17} />
        </Link>
        <Link to="/demo/types">
          <span>Types without writing types</span>
          <ArrowRight size={17} />
        </Link>
        <Link to="/demo/alchemy">
          <span>One source, many targets</span>
          <ArrowRight size={17} />
        </Link>
      </section>

      <section className="gallery gallery-compact">
        <div className="section-heading">
          <span>Pipeline gallery</span>
          <h2>Proof by pipeline</h2>
        </div>
        <PipelineGrid />
      </section>

      <section className="story-band">
        <h2>The story</h2>
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
