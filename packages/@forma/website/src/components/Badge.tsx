import type { PipelineBadge } from "../pipelines/types";

export function Badge({ badge }: { readonly badge: PipelineBadge }) {
  return (
    <span className={`badge ${badge === "live" ? "badge-live" : "badge-preview"}`}>
      {badge.toUpperCase()}
    </span>
  );
}
