// Hybrid Logical Clock (SPEC §3.2, §A.2). A timestamp is (pt, l, r): physical
// wall-clock ms, a logical counter, and the originating ReplicaId.
//
// These functions are PURE: the physical time is passed in as `wall`, never read
// from `Date.now()` here. Keeping the core free of ambient clocks is what makes
// the fold deterministic and replays reproducible (SPEC §5, §6).

export interface Hlc {
  readonly pt: number;
  readonly l: number;
  readonly r: string;
}

/** Compare two HLC timestamps lexicographically by (pt, l, r). */
export function compareHlc(a: Hlc, b: Hlc): number {
  if (a.pt !== b.pt) return a.pt - b.pt;
  if (a.l !== b.l) return a.l - b.l;
  return a.r < b.r ? -1 : a.r > b.r ? 1 : 0;
}

/** Advance a replica's clock for a locally authored event. */
export function tick(clock: Hlc, wall: number, self: string): Hlc {
  const pt = Math.max(clock.pt, wall);
  const l = pt === clock.pt ? clock.l + 1 : 0;
  return { pt, l, r: self };
}

/** Advance a replica's clock on receiving a remote event's timestamp. */
export function receive(clock: Hlc, incoming: Hlc, wall: number, self: string): Hlc {
  const pt = Math.max(clock.pt, incoming.pt, wall);
  let l: number;
  if (pt === clock.pt && pt === incoming.pt) l = Math.max(clock.l, incoming.l) + 1;
  else if (pt === clock.pt) l = clock.l + 1;
  else if (pt === incoming.pt) l = incoming.l + 1;
  else l = 0;
  return { pt, l, r: self };
}

export function initialClock(self: string): Hlc {
  return { pt: 0, l: 0, r: self };
}
