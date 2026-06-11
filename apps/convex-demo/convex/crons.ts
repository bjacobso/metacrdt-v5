import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Valid-time expiry has no triggering write — a submission simply stops being
// visible when its validTo passes. Re-running the compliance rules on a tick
// re-fires obligations whose satisfying submission has lapsed.
crons.interval(
  "recompute compliance for valid-time expiry",
  { hours: 24 },
  internal.compliance.recomputeCompliance,
  {},
);

export default crons;
