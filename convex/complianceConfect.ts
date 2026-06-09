import registeredFunctions from "../confect/_generated/registeredFunctions";

// Manual mount for the Goal 8 Confect sidecar. `pnpm confect:codegen`
// generates `confect/_generated/*` safely; this file exposes only the generated
// compliance planner beside the existing hand-written Convex compliance API.
export const dryRunWorkerCompliance =
  registeredFunctions.compliance.dryRunWorkerCompliance;
