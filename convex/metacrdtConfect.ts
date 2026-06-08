import registeredFunctions from "../confect/_generated/registeredFunctions";

// Manual mount for the Confect spike. We generate `confect/_generated/*` with
// the safe sidecar script, but do not let Confect own this repo's hand-written
// `convex/` tree. This one export proves the generated Effect/Confect function
// can deploy beside the existing plain Convex backend.
export const verifyEvents = registeredFunctions.metacrdt.verifyEvents;
