import { useEffect, useMemo, useRef, useState } from "react";
import { renderGrid, type Scene } from "./engine";
import { useInView } from "../lib/useInView";
import { usePrefersReducedMotion } from "../lib/usePrefersReducedMotion";
import { useRaf } from "../lib/useRaf";

type AsciiSceneProps = {
  scene: Scene;
  ariaLabel: string;
  caption: string;
  decorative?: boolean;
  controllable?: boolean;
};

export function AsciiScene({
  scene,
  ariaLabel,
  caption,
  decorative = false,
  controllable = false,
}: AsciiSceneProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);
  const inView = useInView(shellRef);
  const reducedMotion = usePrefersReducedMotion();
  const [playing, setPlaying] = useState(true);
  const [cols, setCols] = useState(scene.cols);

  useEffect(() => {
    const element = shellRef.current;
    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? element.clientWidth;
      setCols(Math.max(48, Math.min(scene.cols, Math.floor(width / 8.5))));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [scene.cols]);

  const staticFrame = useMemo(
    () => renderGrid(scene.frame(scene.staticTimeMs, { cols, rows: scene.rows })),
    [cols, scene],
  );

  useEffect(() => {
    if (preRef.current) {
      preRef.current.textContent = staticFrame;
    }
  }, [staticFrame]);

  useRaf(
    (tMs) => {
      if (preRef.current) {
        preRef.current.textContent = renderGrid(scene.frame(tMs, { cols, rows: scene.rows }));
      }
    },
    inView && playing && !reducedMotion,
  );

  return (
    <figure className="m-0">
      <div className="ascii-shell" ref={shellRef}>
        <pre
          ref={preRef}
          className="ascii-pre"
          aria-hidden={decorative ? true : undefined}
          aria-label={decorative ? undefined : ariaLabel}
          role={decorative ? undefined : "img"}
        >
          {staticFrame}
        </pre>
        {controllable ? (
          <button
            type="button"
            className="ascii-control"
            onClick={() => setPlaying((value) => !value)}
            aria-pressed={!playing}
          >
            {playing ? "Pause" : "Play"}
          </button>
        ) : null}
      </div>
      <figcaption className="ascii-caption">{caption}</figcaption>
    </figure>
  );
}
