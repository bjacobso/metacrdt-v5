# @metacrdt/effect-merktree

Effect-friendly JSON Merkle trees for independently versioning document pieces.

```ts
import { Effect } from "effect";
import { buildJsonMerkleTreeEffect, flattenMerkleTree } from "@metacrdt/effect-merktree";

const program = Effect.map(
  buildJsonMerkleTreeEffect({
    title: "Roadmap",
    sections: [{ id: "intro", text: "Start here" }],
  }),
  (tree) => flattenMerkleTree(tree),
);
```

The tree is deterministic:

- object keys are sorted before hashing
- array positions are hashed in index order
- leaves are hashed from canonical JSON scalar values
- internal node hashes commit to child names/positions and child hashes

Use `diffMerkleTrees` to find the smallest changed subtrees between two document
versions.
