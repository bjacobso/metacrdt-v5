import { describe, expect, test } from "vitest";
import {
  runCollectConformance,
  runWorkflowConformance,
} from "@metacrdt/testkit";

describe("Convex workflow/collect conformance", () => {
  test("runs the shared workflow semantics suite", async () => {
    const report = await runWorkflowConformance({ name: "convex" });
    expect(report.checks).toContain("collect-step-parks-on-wait-key");
    expect(report.checks).toContain("wait-step-schedules-resume");
  });

  test("runs the shared collect semantics suite", async () => {
    const report = await runCollectConformance({ name: "convex" });
    expect(report.checks).toContain("submission-marker-with-validity");
    expect(report.checks).toContain("requirement-negation-clause");
  });
});
