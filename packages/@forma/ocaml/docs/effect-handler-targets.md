---
title: Effect Handler Target Support
created: 2026-04-30
updated: 2026-04-30
status: active
layer: language
tags:
  - ocaml
  - abi
  - effects
  - targets
---

# Effect Handler Target Support

The host-effect ABI uses OCaml 5 effect handlers to suspend evaluation on
engine-to-host calls and resume with the host-supplied value. Native OCaml
supports this directly, but `js_of_ocaml` and `wasm_of_ocaml` do not enable
effect-handler support by default. Without explicit flags the JS and Wasm
targets can still compile, but they fail at runtime on the first `perform`.

The JS entry therefore uses `js_of_ocaml --effects=cps`, and the Wasm entry uses
`wasm_of_ocaml --effects=cps`. The `effect-handler-target-proof` script builds
and runs a minimal real effect-handler probe on native, JS, and Wasm so this
does not regress silently.

The CPS flags intentionally increase JS/Wasm output size and cold startup. The
architecture gate ratchets JS gzip size, Wasm gzip size, Wasm startup, and
cross-target eval latency so future compiler or stdlib updates cannot inflate
those costs unnoticed.
