import { describe, expect, test } from "vitest";
import { assert, eventId, seal, verifyId, type EventBody } from "./event.js";
import type { Hlc } from "./hlc.js";

const clk = (pt: number, l = 0, r = "ra"): Hlc => ({ pt, l, r });

const body = (over: Partial<EventBody> = {}): EventBody => ({
  kind: "assert",
  actor: "user:1",
  actorType: "human",
  hlc: clk(10),
  e: "worker:maria",
  a: "worker.status",
  v: "active",
  validFrom: 0,
  validTo: null,
  causalRefs: [],
  ...over,
});

describe("event identity (SPEC §4.2)", () => {
  test("same body → same id (content-addressed)", () => {
    expect(eventId(body())).toBe(eventId(body()));
  });

  test("differs on any hashed field", () => {
    const base = eventId(body());
    expect(eventId(body({ v: "terminated" }))).not.toBe(base);
    expect(eventId(body({ a: "worker.role" }))).not.toBe(base);
    expect(eventId(body({ actor: "user:2" }))).not.toBe(base);
    expect(eventId(body({ hlc: clk(11) }))).not.toBe(base);
    expect(eventId(body({ validTo: 999 }))).not.toBe(base);
  });

  test("seq and sig do not affect id", () => {
    const a = seal(body(), { seq: 1, sig: "sig-a" });
    const b = seal(body(), { seq: 99, sig: "sig-b" });
    expect(a.id).toBe(b.id);
  });

  test("verifyId accepts a sealed event and rejects tampering", () => {
    const e = assert({ e: "x", a: "k", v: 1, validFrom: 0, actor: "u", hlc: clk(5) });
    expect(verifyId(e)).toBe(true);
    const tampered = { ...e, v: 2 };
    expect(verifyId(tampered)).toBe(false);
  });

  test("ids are stable strings with the e_ prefix", () => {
    expect(assert({ e: "x", a: "k", v: 1, validFrom: 0, actor: "u", hlc: clk(5) }).id).toMatch(
      /^e_[a-z2-7]+$/,
    );
  });
});
