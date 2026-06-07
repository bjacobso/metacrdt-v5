// The canonical value model and its deterministic encoding (SPEC §A.1). The
// encoding MUST be injective and reproducible across implementations so that
// content addresses (SPEC §4.2) agree on every replica.
//
// v0.1 form: a type-tagged structure serialized as JSON with map entries emitted
// as key-sorted [key, value] pairs (so it never relies on JSON key order) and
// numbers/strings/bytes distinctly tagged (so 1 ≠ "1"). Canonical CBOR is the
// eventual target named by SPEC §A.1.

export type Value =
  | null
  | boolean
  | number
  | string
  | Uint8Array
  | Value[]
  | { [k: string]: Value };

function hex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

/**
 * Pure UTF-8 encoder. The core deliberately avoids ambient globals (no
 * `TextEncoder`, no DOM lib) so it stays platform-neutral and the same on every
 * V8 target. Deterministic by construction.
 */
export function utf8(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c >= 0xd800 && c <= 0xdbff) {
      const c2 = s.charCodeAt(++i);
      c = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
      out.push(
        0xf0 | (c >> 18),
        0x80 | ((c >> 12) & 0x3f),
        0x80 | ((c >> 6) & 0x3f),
        0x80 | (c & 0x3f),
      );
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return new Uint8Array(out);
}

function canonicalNumber(n: number): string {
  if (Number.isNaN(n)) return "nan";
  if (n === Infinity) return "inf";
  if (n === -Infinity) return "-inf";
  if (Object.is(n, -0)) return "0";
  // JS Number.prototype.toString is the shortest round-tripping decimal — stable
  // and reproducible for IEEE-754 binary64.
  return n.toString();
}

// Map each value to a tagged, order-stable shape. Single-key wrappers keep types
// distinct; maps become sorted pair-arrays.
function tag(v: Value): unknown {
  if (v === null) return { z: 0 };
  switch (typeof v) {
    case "boolean":
      return { b: v };
    case "number":
      return { f: canonicalNumber(v) };
    case "string":
      return { s: v.normalize("NFC") };
  }
  if (v instanceof Uint8Array) return { x: hex(v) };
  if (Array.isArray(v)) return { a: v.map(tag) };
  if (typeof v === "object") {
    const keys = Object.keys(v).sort();
    return { o: keys.map((k) => [k, tag(v[k]!)]) };
  }
  throw new Error("unencodable value");
}

/** The canonical, deterministic string form of a value. */
export function canonicalString(v: Value): string {
  return JSON.stringify(tag(v));
}

/** The canonical bytes of a value (UTF-8 of its canonical string). */
export function canonicalBytes(v: Value): Uint8Array {
  return utf8(canonicalString(v));
}
