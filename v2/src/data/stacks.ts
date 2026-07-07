// ---------------------------------------------------------------------------
// stacks — pure helpers for the chip deltas a finalized hand applies to the
// session roster's carried stacks. Extracted so the play screens' finalize path
// AND the "re-open a finalized hand" reversal share ONE implementation instead
// of duplicating the math (and drifting).
//
// A finalized hand moves each seat's stack by `won - spent`: what the seat
// collected from the pot(s) minus everything it committed this hand (voluntary
// bets + forced blinds/antes/posts, all captured in the engine's spentTotal).
// Undoing a finalize is the same math with the sign flipped.
// ---------------------------------------------------------------------------

export interface SeatWinner {
  seat: number;
  amount: number;
}

/** One roster seat's stack state for delta projection. `startStack` is the
 *  seat's stack at the START of this hand — used as the base only when the
 *  carried `stack` is untracked (null), mirroring the finalize fallback. */
export interface RosterStack {
  seat: number;
  stack: number | null;
  startStack: number;
}

export interface StackChange {
  seat: number;
  stack: number;
}

/** Per-seat chip delta a finalized hand applies: chips won minus chips
 *  committed this hand. A seat appears in the result only if it won something
 *  or committed something; a purely untouched seat has no entry. */
export function seatDeltas(
  winners: SeatWinner[],
  spentTotal: Record<number, number>
): Record<number, number> {
  const seats = new Set<number>();
  for (const w of winners) seats.add(w.seat);
  for (const key of Object.keys(spentTotal)) seats.add(Number(key));

  const deltas: Record<number, number> = {};
  for (const seat of seats) {
    const won = winners.find((w) => w.seat === seat)?.amount ?? 0;
    deltas[seat] = won - (spentTotal[seat] ?? 0);
  }
  return deltas;
}

/** Project `deltas` onto the roster stacks. `sign` is +1 to APPLY the deltas
 *  (finalize) and -1 to REVERSE them (re-open). Only seats whose stack actually
 *  moves are returned, so a delta-0 seat with a tracked stack is skipped — the
 *  caller writes exactly the rows that change, as the original finalize loop
 *  did. */
function project(
  roster: RosterStack[],
  deltas: Record<number, number>,
  sign: 1 | -1
): StackChange[] {
  const changes: StackChange[] = [];
  for (const p of roster) {
    const delta = deltas[p.seat] ?? 0;
    const base = p.stack ?? p.startStack;
    const next = base + sign * delta;
    if (next !== p.stack) changes.push({ seat: p.seat, stack: next });
  }
  return changes;
}

/** Stacks after a hand is finalized (deltas applied). */
export function applySeatDeltas(
  roster: RosterStack[],
  deltas: Record<number, number>
): StackChange[] {
  return project(roster, deltas, 1);
}

/** Stacks after a finalized hand is re-opened (deltas undone). */
export function reverseSeatDeltas(
  roster: RosterStack[],
  deltas: Record<number, number>
): StackChange[] {
  return project(roster, deltas, -1);
}
