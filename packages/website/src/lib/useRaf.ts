import { useEffect, useRef } from "react";

export function useRaf(callback: (tMs: number) => void, active: boolean): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!active || typeof requestAnimationFrame === "undefined") {
      return;
    }
    let frame = 0;
    let last = 0;
    const tick = (tMs: number) => {
      if (tMs - last >= 33) {
        callbackRef.current(tMs);
        last = tMs;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);
}
