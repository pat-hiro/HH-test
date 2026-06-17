// ---------------------------------------------------------------------------
// Deterministic forced-bet builder.
//
// Replaces v1's race-prone async useEffect that inserted blinds/antes/straddles
// as "actions" (which double-posted under React StrictMode). Here the forced
// bets are a pure function of the table configuration, computed once.
// ---------------------------------------------------------------------------

import type { ForcedBet, HandSetup, SeatSetup } from "./types";

export function nextActive(
  fromSeat: number,
  seatCount: number,
  eligible: number[]
): number | null {
  if (eligible.length === 0) return null;
  for (let i = 1; i <= seatCount; i++) {
    const s = ((fromSeat - 1 + i) % seatCount) + 1;
    if (eligible.includes(s)) return s;
  }
  return null;
}

export function sbSeat(
  buttonSeat: number,
  seatCount: number,
  eligible: number[]
): number | null {
  // heads-up: the button is the small blind
  if (eligible.length === 2) return buttonSeat;
  return nextActive(buttonSeat, seatCount, eligible);
}

export function bbSeat(
  buttonSeat: number,
  seatCount: number,
  eligible: number[]
): number | null {
  const sb = sbSeat(buttonSeat, seatCount, eligible);
  if (sb === null) return null;
  return nextActive(sb, seatCount, eligible);
}

export interface BlindConfig {
  seats: SeatSetup[];
  seatCount: number;
  buttonSeat: number;
  sb: number;
  bb: number;
  /** BB-ante amount (dead, pot-only). 0 = no ante. */
  bbAnte?: number;
  /** auto-straddle the UTG seat */
  autoStraddle?: boolean;
  /** straddle amount; defaults to 2*bb */
  straddleAmount?: number;
  /** miss-blind posts on returning players */
  posts?: { seat: number; amount: number; ante?: number }[];
}

export function buildForcedBets(cfg: BlindConfig): ForcedBet[] {
  const eligible = cfg.seats.map((s) => s.seat);
  const forced: ForcedBet[] = [];

  const sb = sbSeat(cfg.buttonSeat, cfg.seatCount, eligible);
  const bb = bbSeat(cfg.buttonSeat, cfg.seatCount, eligible);

  // BB ante (dead): posted by the BB seat
  if (cfg.bbAnte && cfg.bbAnte > 0 && bb !== null) {
    forced.push({ seat: bb, amount: cfg.bbAnte, kind: "ante", live: false });
  }

  // miss-blind posts (live BB-sized + optional dead ante)
  for (const p of cfg.posts ?? []) {
    forced.push({ seat: p.seat, amount: p.amount, kind: "post", live: true });
    if (p.ante && p.ante > 0) {
      forced.push({ seat: p.seat, amount: p.ante, kind: "ante", live: false });
    }
  }

  if (sb !== null) forced.push({ seat: sb, amount: cfg.sb, kind: "sb", live: true });
  if (bb !== null) forced.push({ seat: bb, amount: cfg.bb, kind: "bb", live: true });

  if (cfg.autoStraddle && bb !== null) {
    const utg = nextActive(bb, cfg.seatCount, eligible);
    if (utg !== null) {
      forced.push({
        seat: utg,
        amount: cfg.straddleAmount ?? cfg.bb * 2,
        kind: "straddle",
        live: true,
      });
    }
  }

  return forced;
}

export function makeSetup(cfg: BlindConfig): HandSetup {
  return {
    seats: cfg.seats,
    seatCount: cfg.seatCount,
    buttonSeat: cfg.buttonSeat,
    bb: cfg.bb,
    forced: buildForcedBets(cfg),
  };
}
