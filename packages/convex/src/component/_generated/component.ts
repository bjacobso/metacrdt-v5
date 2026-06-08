/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    log: {
      appendAssert: FunctionReference<
        "mutation",
        "internal",
        {
          a: string;
          actorId: string;
          actorType: "user" | "system" | "agent" | "migration";
          cardinality?: "many" | "one";
          causalRefs?: Array<string>;
          e: string;
          eventMetadata?: any;
          factId?: string;
          metadata?: any;
          reason?: string;
          requestId?: string;
          source?: string;
          txTime?: number;
          v: any;
          validFrom?: number;
          validTo?: number;
        },
        { eventId: string; factId?: string; rowId: string; txId: string },
        Name
      >;
      appendLifecycle: FunctionReference<
        "mutation",
        "internal",
        {
          a: string;
          actorId: string;
          actorType: "user" | "system" | "agent" | "migration";
          causalRefs?: Array<string>;
          e: string;
          eventMetadata?: any;
          factId?: string;
          kind: "retract" | "tombstone" | "untombstone";
          metadata?: any;
          reason?: string;
          requestId?: string;
          source?: string;
          targetEventId: string;
          txTime?: number;
          v: any;
          validTo?: number;
        },
        { eventId: string; factId?: string; rowId: string; txId: string },
        Name
      >;
      collectionByToken: FunctionReference<
        "query",
        "internal",
        { token: string },
        | { found: false; reason?: string }
        | {
            fields: Array<any>;
            form: string;
            found: true;
            scope: string;
            status: string;
            subject: string;
            title: string;
          },
        Name
      >;
      getCurrentEntity: FunctionReference<
        "query",
        "internal",
        { e: string; limit?: number },
        {
          attributes: Array<{
            a: string;
            facts: Array<{
              a: string;
              assertEventId: string;
              assertedAt: number;
              e: string;
              factId: string;
              txTime: number;
              updatedAt: number;
              v: any;
              validFrom: number;
              validTo?: number;
            }>;
            values: Array<any>;
          }>;
          e: string;
          facts: Array<{
            a: string;
            assertEventId: string;
            assertedAt: number;
            e: string;
            factId: string;
            txTime: number;
            updatedAt: number;
            v: any;
            validFrom: number;
            validTo?: number;
          }>;
        } | null,
        Name
      >;
      getEvent: FunctionReference<
        "query",
        "internal",
        { eventId: string },
        {
          a: string;
          actor: string;
          actorType: "human" | "system" | "agent" | "migration";
          causalRefs: Array<string>;
          e: string;
          eventId: string;
          hasProtocolMetadata: boolean;
          hlc: { l: number; pt: number; r: string };
          kind: "assert" | "retract" | "tombstone" | "untombstone";
          reason?: string;
          rowId: string;
          targetEventId?: string;
          txId: string;
          txTime: number;
          v: any;
          validEventId: boolean;
          validFrom?: number;
          validTo?: number;
          verifiable: boolean;
        } | null,
        Name
      >;
      issueCollection: FunctionReference<
        "mutation",
        "internal",
        {
          actorId: string;
          actorType: "user" | "system" | "agent" | "migration";
          expireMs?: number;
          form: string;
          now?: number;
          scope: string;
          subject: string;
        },
        { collectUrl: string; reused: boolean; runId: string; token: string },
        Name
      >;
      listCollections: FunctionReference<
        "query",
        "internal",
        { limit?: number; subject?: string },
        Array<{
          context?: any;
          form: string;
          issuedAt: number;
          runId: string;
          scope: string;
          status: string;
          subject: string;
          token: string;
          tokenConsumedAt?: number;
          tokenExpiresAt?: number;
          updatedAt: number;
        }>,
        Name
      >;
      listCurrent: FunctionReference<
        "query",
        "internal",
        { a?: string; e?: string; limit?: number },
        Array<{
          a: string;
          assertEventId: string;
          assertedAt: number;
          e: string;
          factId: string;
          txTime: number;
          updatedAt: number;
          v: any;
          validFrom: number;
          validTo?: number;
        }>,
        Name
      >;
      listCurrentEntities: FunctionReference<
        "query",
        "internal",
        { limit?: number; type?: string },
        Array<{
          e: string;
          name?: any;
          type: string;
          typeFact: {
            a: string;
            assertEventId: string;
            assertedAt: number;
            e: string;
            factId: string;
            txTime: number;
            updatedAt: number;
            v: any;
            validFrom: number;
            validTo?: number;
          };
          updatedAt: number;
        }>,
        Name
      >;
      listEvents: FunctionReference<
        "query",
        "internal",
        { a?: string; e?: string; limit?: number },
        Array<{
          a: string;
          actor: string;
          actorType: "human" | "system" | "agent" | "migration";
          causalRefs: Array<string>;
          e: string;
          eventId: string;
          hasProtocolMetadata: boolean;
          hlc: { l: number; pt: number; r: string };
          kind: "assert" | "retract" | "tombstone" | "untombstone";
          reason?: string;
          rowId: string;
          targetEventId?: string;
          txId: string;
          txTime: number;
          v: any;
          validEventId: boolean;
          validFrom?: number;
          validTo?: number;
          verifiable: boolean;
        }>,
        Name
      >;
      rebuildProjections: FunctionReference<
        "mutation",
        "internal",
        {},
        { currentFacts: number; events: number; facts: number },
        Name
      >;
      submitCollection: FunctionReference<
        "mutation",
        "internal",
        { now?: number; token: string; values: any },
        { ok: true } | { ok: false; reason: string },
        Name
      >;
    };
    protocol: {
      buildAssertRow: FunctionReference<
        "query",
        "internal",
        {
          a: string;
          causalRefs?: Array<string>;
          e: string;
          factId?: string;
          metadata?: any;
          reason?: string;
          tx: {
            _creationTime: number;
            actorId: string;
            actorType: "user" | "system" | "agent" | "migration";
            reason?: string;
            txTime: number;
          };
          txId: string;
          v: any;
          validFrom: number;
          validTo?: number;
        },
        {
          a: string;
          causalRefs?: Array<string>;
          e: string;
          eventId: string;
          factId?: string;
          hlc: { l: number; pt: number; r: string };
          kind: "assert" | "retract" | "tombstone" | "untombstone";
          metadata?: any;
          reason?: string;
          replicaId: string;
          targetEventId?: string;
          txId: string;
          txTime: number;
          v: any;
          validFrom?: number;
          validTo?: number;
        },
        Name
      >;
      buildLifecycleRow: FunctionReference<
        "query",
        "internal",
        {
          a: string;
          causalRefs?: Array<string>;
          e: string;
          factId?: string;
          kind: "retract" | "tombstone" | "untombstone";
          metadata?: any;
          reason?: string;
          targetEventId: string;
          tx: {
            _creationTime: number;
            actorId: string;
            actorType: "user" | "system" | "agent" | "migration";
            reason?: string;
            txTime: number;
          };
          txId: string;
          v: any;
          validTo?: number;
        },
        {
          a: string;
          causalRefs?: Array<string>;
          e: string;
          eventId: string;
          factId?: string;
          hlc: { l: number; pt: number; r: string };
          kind: "assert" | "retract" | "tombstone" | "untombstone";
          metadata?: any;
          reason?: string;
          replicaId: string;
          targetEventId?: string;
          txId: string;
          txTime: number;
          v: any;
          validFrom?: number;
          validTo?: number;
        },
        Name
      >;
      summarizeRow: FunctionReference<
        "query",
        "internal",
        {
          row: {
            a: string;
            causalRefs?: Array<string>;
            e: string;
            eventId?: string;
            factId?: string;
            hlc?: { l: number; pt: number; r: string };
            kind:
              | "assert"
              | "retract"
              | "tombstone"
              | "untombstone"
              | "correction";
            metadata?: any;
            reason?: string;
            replicaId?: string;
            seq?: number;
            targetEventId?: string;
            txId?: string;
            txTime: number;
            v: any;
            validFrom?: number;
            validTo?: number;
          };
          tx: {
            _creationTime: number;
            actorId: string;
            actorType: "user" | "system" | "agent" | "migration";
            reason?: string;
            txTime: number;
          };
        },
        {
          a: string;
          actor: string;
          actorType: "human" | "system" | "agent" | "migration";
          causalRefs: Array<string>;
          e: string;
          eventId?: string;
          hasProtocolMetadata: boolean;
          hlc?: { l: number; pt: number; r: string };
          kind:
            | "assert"
            | "retract"
            | "tombstone"
            | "untombstone"
            | "correction";
          reason?: string;
          targetEventId?: string;
          txTime: number;
          v: any;
          validEventId: boolean;
          validFrom?: number;
          validTo?: number;
          verifiable: boolean;
        },
        Name
      >;
      summarizeRows: FunctionReference<
        "query",
        "internal",
        {
          inputs: Array<{
            row: {
              a: string;
              causalRefs?: Array<string>;
              e: string;
              eventId?: string;
              factId?: string;
              hlc?: { l: number; pt: number; r: string };
              kind:
                | "assert"
                | "retract"
                | "tombstone"
                | "untombstone"
                | "correction";
              metadata?: any;
              reason?: string;
              replicaId?: string;
              seq?: number;
              targetEventId?: string;
              txId?: string;
              txTime: number;
              v: any;
              validFrom?: number;
              validTo?: number;
            };
            tx: {
              _creationTime: number;
              actorId: string;
              actorType: "user" | "system" | "agent" | "migration";
              reason?: string;
              txTime: number;
            };
          }>;
        },
        Array<{
          a: string;
          actor: string;
          actorType: "human" | "system" | "agent" | "migration";
          causalRefs: Array<string>;
          e: string;
          eventId?: string;
          hasProtocolMetadata: boolean;
          hlc?: { l: number; pt: number; r: string };
          kind:
            | "assert"
            | "retract"
            | "tombstone"
            | "untombstone"
            | "correction";
          reason?: string;
          targetEventId?: string;
          txTime: number;
          v: any;
          validEventId: boolean;
          validFrom?: number;
          validTo?: number;
          verifiable: boolean;
        }>,
        Name
      >;
    };
  };
