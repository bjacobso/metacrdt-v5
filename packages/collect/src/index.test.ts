import { describe, expect, test } from "vitest";
import {
  COLLECT_TOKEN_TTL_MS,
  formDefinitionFacts,
  formEntity,
  hasLiveToken,
  isLiveToken,
  requirementClauses,
  requirementDeps,
  requirementWhere,
  scopeEntity,
  submissionFacts,
  tokenExpiresAt,
  tokenInvalidReason,
  validateSubmission,
  type FormDef,
} from "./index.js";

const i9: FormDef = {
  form: "i9",
  title: "Form I-9",
  validityDays: 365,
  fields: [
    { name: "ssn", label: "SSN", type: "string", required: true, pii: true },
    { name: "age", label: "Age", type: "number" },
    { name: "remote", label: "Remote", type: "boolean" },
    { name: "signedAt", label: "Signed at", type: "date" },
    {
      name: "citizenship",
      label: "Citizenship",
      type: "select",
      options: ["citizen", "authorized_alien"],
      required: true,
    },
  ],
};

describe("@metacrdt/collect", () => {
  test("formEntity and formDefinitionFacts lower form definitions", () => {
    expect(formEntity("i9")).toBe("form:i9");
    expect(formDefinitionFacts(i9)).toEqual([
      { e: "form:i9", a: "type", value: "Form" },
      {
        e: "form:i9",
        a: "formDef",
        value: {
          title: "Form I-9",
          fields: i9.fields,
        },
      },
    ]);
  });

  test("validateSubmission accepts and normalizes declared fields", () => {
    expect(
      validateSubmission(i9, {
        ssn: "111-22-3333",
        age: 42,
        remote: false,
        signedAt: "2026-06-09",
        citizenship: "citizen",
      }),
    ).toEqual({
      ok: true,
      values: {
        ssn: "111-22-3333",
        age: 42,
        remote: false,
        signedAt: "2026-06-09",
        citizenship: "citizen",
      },
    });
  });

  test("validateSubmission rejects required, type, option, and unknown-field errors", () => {
    expect(
      validateSubmission(i9, {
        age: Number.NaN,
        remote: "no",
        signedAt: "not-a-date",
        citizenship: "visitor",
        extra: "ignored",
      }),
    ).toEqual({
      ok: false,
      errors: [
        { field: "extra", reason: "unknown field" },
        { field: "ssn", reason: "required" },
        { field: "age", reason: "expected number" },
        { field: "remote", reason: "expected boolean" },
        { field: "signedAt", reason: "expected date" },
        { field: "citizenship", reason: "invalid option" },
      ],
    });
  });

  test("submissionFacts derives field facts and the submitted marker with validity", () => {
    expect(
      submissionFacts(
        "worker:maria",
        i9,
        { ssn: "111-22-3333", citizenship: "authorized_alien" },
        "employer:acme",
        1_000,
      ),
    ).toEqual([
      { e: "worker:maria", a: "i9/ssn", value: "111-22-3333" },
      { e: "worker:maria", a: "i9/citizenship", value: "authorized_alien" },
      {
        e: "worker:maria",
        a: "submitted.i9",
        value: "employer:acme",
        validTo: 1_000 + 365 * 24 * 60 * 60 * 1000,
      },
    ]);
  });

  test("submissionFacts throws structured validation failures", () => {
    expect(() => submissionFacts("worker:maria", i9, {}, "employer:acme", 1_000))
      .toThrow(/invalid submission for i9: ssn: required, citizenship: required/);
  });

  test("scopeEntity derives scope entities and applies optional guards", () => {
    expect(scopeEntity({ scopeAttr: "employer" }, { employer: "employer:acme" }))
      .toBe("employer:acme");
    expect(
      scopeEntity(
        { scopeAttr: "job", guard: ["role", "forklift"] },
        { job: "job:forklift1" },
        { role: "forklift" },
      ),
    ).toBe("job:forklift1");
    expect(
      scopeEntity(
        { scopeAttr: "job", guard: ["role", "forklift"] },
        { job: "job:cashier1" },
        { role: "cashier" },
      ),
    ).toBeNull();
  });

  test("requirement clause helpers lower requires and task rules", () => {
    const spec = { form: "forklift", scopeAttr: "job", guard: ["role", "forklift"] as const };
    const where = [
      ["?p", "type", "Placement"],
      ["?p", "worker", "?w"],
      ["?p", "job", "?s"],
      ["?s", "role", "forklift"],
    ];
    expect(requirementWhere(spec)).toEqual(where);
    expect(requirementDeps(spec)).toEqual(["type", "worker", "job", "role"]);
    expect(requirementClauses(spec)).toEqual({
      requirement: {
        name: "require.forklift",
        where,
        emit: { e: "?w", a: "requires.forklift", v: "?s" },
        dependsOnAttributes: ["type", "worker", "job", "role"],
      },
      task: {
        name: "task.forklift",
        where: [...where, { not: ["?w", "submitted.forklift", "?s"] }],
        emit: { e: "?w", a: "task.forklift", v: "?s" },
        dependsOnAttributes: ["type", "worker", "job", "role", "submitted.forklift"],
      },
    });
  });

  test("token predicates detect invalid and reusable live tokens", () => {
    expect(tokenExpiresAt(1_000)).toBe(1_000 + COLLECT_TOKEN_TTL_MS);
    expect(tokenExpiresAt(1_000, 30)).toBe(31_000);
    expect(tokenInvalidReason({ status: "waiting", tokenConsumedAt: 2_000 }, 3_000))
      .toBe("used");
    expect(tokenInvalidReason({ status: "waiting", tokenExpiresAt: 3_000 }, 3_000))
      .toBe("expired");
    expect(tokenInvalidReason({ status: "completed" }, 3_000)).toBe("not waiting");
    expect(tokenInvalidReason({ status: "waiting", tokenExpiresAt: 3_001 }, 3_000))
      .toBeNull();
    expect(isLiveToken({ status: "waiting", token: "t", tokenExpiresAt: 3_001 }, 3_000))
      .toBe(true);
    expect(
      hasLiveToken(
        [
          { status: "waiting", token: "host", collectionTarget: "host" },
          { status: "waiting", token: "component", collectionTarget: "component" },
        ],
        3_000,
        "component",
      ),
    ).toBe(true);
  });
});
