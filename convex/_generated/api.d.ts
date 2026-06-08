/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions from "../actions.js";
import type * as appconfig from "../appconfig.js";
import type * as attributes from "../attributes.js";
import type * as compliance from "../compliance.js";
import type * as complianceConfect from "../complianceConfect.js";
import type * as configHistory from "../configHistory.js";
import type * as crons from "../crons.js";
import type * as datalog from "../datalog.js";
import type * as entities from "../entities.js";
import type * as facts from "../facts.js";
import type * as flows from "../flows.js";
import type * as forms from "../forms.js";
import type * as http from "../http.js";
import type * as lib_coreEvent from "../lib/coreEvent.js";
import type * as lib_engine from "../lib/engine.js";
import type * as lib_meta from "../lib/meta.js";
import type * as lib_origin from "../lib/origin.js";
import type * as lib_readAuth from "../lib/readAuth.js";
import type * as lib_visibility from "../lib/visibility.js";
import type * as materialize from "../materialize.js";
import type * as metacrdtConfect from "../metacrdtConfect.js";
import type * as overview from "../overview.js";
import type * as rebuild from "../rebuild.js";
import type * as rules from "../rules.js";
import type * as staticHosting from "../staticHosting.js";
import type * as system from "../system.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  actions: typeof actions;
  appconfig: typeof appconfig;
  attributes: typeof attributes;
  compliance: typeof compliance;
  complianceConfect: typeof complianceConfect;
  configHistory: typeof configHistory;
  crons: typeof crons;
  datalog: typeof datalog;
  entities: typeof entities;
  facts: typeof facts;
  flows: typeof flows;
  forms: typeof forms;
  http: typeof http;
  "lib/coreEvent": typeof lib_coreEvent;
  "lib/engine": typeof lib_engine;
  "lib/meta": typeof lib_meta;
  "lib/origin": typeof lib_origin;
  "lib/readAuth": typeof lib_readAuth;
  "lib/visibility": typeof lib_visibility;
  materialize: typeof materialize;
  metacrdtConfect: typeof metacrdtConfect;
  overview: typeof overview;
  rebuild: typeof rebuild;
  rules: typeof rules;
  staticHosting: typeof staticHosting;
  system: typeof system;
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
