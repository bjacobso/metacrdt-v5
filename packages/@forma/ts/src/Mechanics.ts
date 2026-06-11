/**
 * Mechanics artifact projection and hosted operation runtime.
 *
 * @module Mechanics
 */

export {
  isMechanicsArtifactForm,
  mechanicsPackageableDeclarations,
  type MechanicsArtifactDiagnostic,
  type MechanicsArtifactResult,
} from "./mechanics/artifact.js";

export {
  generateMechanicsEffectSchemaModule,
  type MechanicsEffectSchemaModule,
} from "./mechanics/effect-schema.js";

export {
  generateMechanicsEffectTypeScriptModule,
  type MechanicsEffectTypeScriptModule,
} from "./mechanics/effect-typescript.js";

export {
  makeMechanicsRuntime,
  MechanicsRuntimeError,
  type MechanicsRuntime,
  type MechanicsRuntimeOptions,
  type MechanicsRuntimeValue,
  type MechanicsServiceImplementation,
  type MechanicsServiceMethod,
} from "./mechanics/runtime.js";
