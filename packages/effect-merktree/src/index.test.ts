import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  buildJsonMerkleTree,
  buildJsonMerkleTreeEffect,
  diffMerkleTrees,
  flattenMerkleTree,
  indexMerklePieces,
} from "./index.js";

describe("effect-merktree", () => {
  it("builds stable roots independent of object insertion order", () => {
    const a = buildJsonMerkleTree({
      title: "Roadmap",
      sections: [{ id: "intro", text: "Start here" }],
      published: false,
    });
    const b = buildJsonMerkleTree({
      published: false,
      sections: [{ text: "Start here", id: "intro" }],
      title: "Roadmap",
    });

    expect(a.hash).toEqual(b.hash);
  });

  it("exposes independently addressable pieces", () => {
    const tree = buildJsonMerkleTree({
      title: "Roadmap",
      sections: [{ id: "intro", text: "Start here" }],
    });
    const pieces = indexMerklePieces(flattenMerkleTree(tree));

    expect(pieces.get("")?.kind).toBe("object");
    expect(pieces.get("/title")).toMatchObject({
      kind: "leaf",
      value: "Roadmap",
    });
    expect(pieces.get("/sections/0/text")).toMatchObject({
      kind: "leaf",
      value: "Start here",
    });
  });

  it("diffs at the smallest changed subtree", () => {
    const before = buildJsonMerkleTree({
      title: "Roadmap",
      sections: [{ id: "intro", text: "Start here" }],
    });
    const after = buildJsonMerkleTree({
      title: "Roadmap",
      sections: [{ id: "intro", text: "Updated" }],
    });

    expect(diffMerkleTrees(before, after)).toEqual([
      {
        pointer: "/sections/0/text",
        path: ["sections", 0, "text"],
        beforeHash: expect.any(String),
        afterHash: expect.any(String),
      },
    ]);
  });

  it("reports inserted and removed pieces", () => {
    const before = buildJsonMerkleTree({
      title: "Roadmap",
      status: "draft",
    });
    const after = buildJsonMerkleTree({
      title: "Roadmap",
      owner: "team",
    });

    expect(diffMerkleTrees(before, after)).toEqual([
      {
        pointer: "/owner",
        path: ["owner"],
        afterHash: expect.any(String),
      },
      {
        pointer: "/status",
        path: ["status"],
        beforeHash: expect.any(String),
      },
    ]);
  });

  it("validates unknown input through Effect", async () => {
    const result = await Effect.runPromise(
      Effect.either(
        buildJsonMerkleTreeEffect({
          ok: true,
          bad: Number.NaN,
        }),
      ),
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.issue).toMatchObject({
        reason: "nonFiniteNumber",
        path: ["bad"],
      });
    }
  });

  it("rejects non-plain objects", async () => {
    const result = await Effect.runPromise(Effect.either(buildJsonMerkleTreeEffect(new Date(0))));

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.issue.reason).toBe("nonJsonValue");
    }
  });
});
