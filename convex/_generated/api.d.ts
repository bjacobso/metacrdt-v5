/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as attributes from "../attributes.js";
import type * as datalog from "../datalog.js";
import type * as entities from "../entities.js";
import type * as facts from "../facts.js";
import type * as http from "../http.js";
import type * as lib_engine from "../lib/engine.js";
import type * as lib_meta from "../lib/meta.js";
import type * as lib_visibility from "../lib/visibility.js";
import type * as materialize from "../materialize.js";
import type * as rules from "../rules.js";
import type * as staticHosting from "../staticHosting.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  attributes: typeof attributes;
  datalog: typeof datalog;
  entities: typeof entities;
  facts: typeof facts;
  http: typeof http;
  "lib/engine": typeof lib_engine;
  "lib/meta": typeof lib_meta;
  "lib/visibility": typeof lib_visibility;
  materialize: typeof materialize;
  rules: typeof rules;
  staticHosting: typeof staticHosting;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  selfHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"selfHosting">;
};
