import { describe, expect, it } from "vitest";
import { renderGrid } from "./engine";
import {
  appendOnlyLogScene,
  bitemporalScene,
  convergenceScene,
  derivationScene,
  foldScene,
} from "./scenes";

describe("ascii scenes", () => {
  it("renders stable explanatory frames", () => {
    const frames = [
      appendOnlyLogScene,
      foldScene,
      convergenceScene,
      bitemporalScene,
      derivationScene,
    ].map((scene) => renderGrid(scene.frame(1000, { cols: scene.cols, rows: scene.rows })));

    expect(frames).toMatchSnapshot();
  });

  it("respects compact widths", () => {
    const frame = renderGrid(appendOnlyLogScene.frame(1000, { cols: 48, rows: appendOnlyLogScene.rows }));

    expect(frame.split("\n").every((line) => line.length === 48)).toBe(true);
    expect(frame).toContain("append-only");
  });
});
