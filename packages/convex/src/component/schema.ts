import { defineSchema } from "convex/server";

// Stateless component surface for protocol helpers. Host apps keep their own
// factEvents/transactions tables and pass rows across this boundary explicitly.
export default defineSchema({});
