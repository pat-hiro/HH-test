// ---------------------------------------------------------------------------
// Pure betting-state reducer.
//
// computeState(setup, actions) derives the full betting view at the current
// decision point. It is deterministic and side-effect free, so it can be unit
// tested exhaustively (see reducer.test.ts). The UI never recomputes any of
// this by hand — it only reads HandState and renders it.
// ---------------------------------------------------------------------------

import { nextActive, sbSeat, bbSeat } from "./setup";
import type {
  Action,
  HandSetup,
  HandState,
  SidePot,
  Street,
} from "./types";

const STREETS: Street[] = ["PF", "F", "T", "R"];

function startStackOf(setup: HandSetup, seat: number): number {
  return setup.seats.find((s) => s.seat === seat)?.startStack ?? Infinity;
}

/** first seat to act on a given street, among non-folded seats */
function firstToAct(
  setup: HandSetup,
  street: Street,
  inHand: number[]
): number | null {
  if (inHand.length === 0) return null;
  if (street === "PF") {
    // after the last live blind/straddle in betting order
    const straddles = setup.forced.filter((f) => f.kind === "straddle");
    const bb = setup.forced.find((f) => f.kind === "bb");
    const anchor =
      straddles.length > 0
        ? straddles[straddles.length - 1].seat
        : bb
          ? bb.seat
          : setup.buttonSeat;
    return nextActive(anchor, setup.seatCount, inHand);
  }
  // postflop: first active seat clockwise from the button (SB-ward)
  return nextActive(setup.buttonSeat, setup.seatCount, inHand);
}

/** classic layered side-pot computation from each seat's total contribution */
export function computeSidePots(
  contributions: Record<number, number>,
  folded: Set<number>
): SidePot[] {
  const entries = Object.entries(contributions)
    .map(([seat, amt]) => ({ seat: Number(seat), amt }))
    .filter((e) => e.amt > 0);
  if (entries.length === 0) return [];

  const pots: SidePot[] = [];
  let prevLevel = 0;
  const levels = Array.from(new Set(entries.map((e) => e.amt))).sort(
    (a, b) => a - b
  );

  for (const level of levels) {
    const slice = level - prevLevel;
    const contributors = entries.filter((e) => e.amt >= level);
    const amount = slice * contributors.length;
    if (amount > 0) {
      const eligible = contributors
        .map((c) => c.seat)
        .filter((s) => !folded.has(s));
      pots.push({ amount, eligible });
    }
    prevLevel = level;
  }
  // merge adjacent pots with identical eligibility (cosmetic)
  const merged: SidePot[] = [];
  for (const p of pots) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.eligible.length === p.eligible.length &&
      last.eligible.every((s) => p.eligible.includes(s))
    ) {
      last.amount += p.amount;
    } else {
      merged.push({ ...p });
    }
  }
  return merged;
}

export function computeState(setup: HandSetup, actions: Action[]): HandState {
  const allSeats = setup.seats.map((s) => s.seat);
  const spentTotal: Record<number, number> = {};
  for (const s of allSeats) spentTotal[s] = 0;

  const folded = new Set<number>();
  const allIn = new Set<number>();

  // seed pot from forced bets (both live and dead contribute to spent/pot).
  // Each entry's effective amount is capped by the seat's remaining stack —
  // cumulative per seat, so a second forced bet only gets what's left.
  const forcedEffective = setup.forced.map((f) => {
    const behind = Math.max(
      0,
      startStackOf(setup, f.seat) - (spentTotal[f.seat] ?? 0)
    );
    const eff = Math.min(f.amount, behind);
    spentTotal[f.seat] = (spentTotal[f.seat] ?? 0) + eff;
    return eff;
  });
  // a seat whose forced bets consume its entire stack is all-in before ever
  // taking a voluntary action, so it must not be dealt a turn to act
  for (const s of allSeats) {
    if (spentTotal[s] >= startStackOf(setup, s)) allIn.add(s);
  }

  // The view we will return is the first street that is not yet complete.
  let view: HandState | null = null;
  let lastStreetProcessed: Street = "PF";

  for (const street of STREETS) {
    lastStreetProcessed = street;

    // live commitments this street
    const live: Record<number, number> = {};
    for (const s of allSeats) live[s] = 0;

    // seed PF live commitments from forced LIVE bets
    let currentBet = 0;
    let lastRaiseSize = setup.bb; // floor for min-raise
    let reopenedBet = 0; // bet level at which action was last (re)opened by a FULL raise
    if (street === "PF") {
      setup.forced.forEach((f, i) => {
        // live commitments use the same stack-capped effective amounts
        if (f.live) live[f.seat] = (live[f.seat] ?? 0) + forcedEffective[i];
      });
      currentBet = Math.max(0, ...Object.values(live));
      reopenedBet = currentBet; // BB/straddle is the opening "raise"
      // the opening "bet" preflop is the big blind (or straddle): min reopen = 2x
      lastRaiseSize = currentBet > 0 ? currentBet : setup.bb;
    }

    // seats that took a voluntary action this street (blind posting is NOT voluntary)
    const acted = new Set<number>();
    let lastAggressor: number | null = null;
    /** seat of the most recently logged voluntary action this street; used to
     *  decide where the next-to-act scan starts (action moves clockwise from
     *  the most recent actor, NOT from firstToAct). */
    let lastActor: number | null = null;

    const streetActions = actions.filter((a) => a.street === street);
    for (const a of streetActions) {
      acted.add(a.seat);
      lastActor = a.seat;
      if (a.type === "fold") {
        folded.add(a.seat);
        continue;
      }
      if (a.amount > 0) {
        // defensive clamp: a stored action can never spend more than the
        // seat's remaining stack (protects pot/side pots from bad old data)
        const behind = Math.max(
          0,
          startStackOf(setup, a.seat) - (spentTotal[a.seat] ?? 0)
        );
        const inc = Math.min(a.amount, behind);
        live[a.seat] = (live[a.seat] ?? 0) + inc;
        spentTotal[a.seat] = (spentTotal[a.seat] ?? 0) + inc;
        if (live[a.seat] > currentBet) {
          const raiseSize = live[a.seat] - currentBet;
          const isFullRaise = raiseSize >= lastRaiseSize;
          if (isFullRaise) {
            // a full raise reopens action: anyone with live[s] < new currentBet
            // must act again AND may legally re-raise.
            lastRaiseSize = raiseSize;
            reopenedBet = live[a.seat];
          }
          // a partial (under-)raise (all-in for less than the min raise) still
          // raises currentBet, but reopenedBet stays at the previous level so
          // seats already matched at that level can call only, not re-raise.
          currentBet = live[a.seat];
          lastAggressor = a.seat;
        }
      }
      if (a.type === "allin") {
        allIn.add(a.seat);
      }
      // a seat is all-in if it has committed its entire stack
      if (spentTotal[a.seat] >= startStackOf(setup, a.seat)) {
        allIn.add(a.seat);
      }
    }

    const inHand = allSeats.filter((s) => !folded.has(s));
    const pot = Object.values(spentTotal).reduce((a, b) => a + b, 0);

    // hand ends immediately if only one seat remains
    if (inHand.length <= 1) {
      return finalize(setup, {
        street,
        currentBet,
        live,
        spentTotal,
        pot,
        folded,
        allIn,
        inHand,
        currentSeat: null,
        lastAggressor,
        streetComplete: true,
        handComplete: true,
      });
    }

    const canAct = inHand.filter((s) => !allIn.has(s));

    // find the seat that still needs to act
    //   - if nobody has acted yet this street, start from firstToAct
    //   - otherwise, start from the seat AFTER the most recent actor so that
    //     action moves clockwise around the table. This is the rule that was
    //     missing in v2: without it, after a raise the scan would pick up the
    //     limper who has to call again BEFORE the seats between the raiser
    //     and the limper — i.e., the limper got the action instead of the
    //     next seat clockwise from the raiser.
    //   - We scan even when canAct.length === 1: the remaining player may
    //     still owe chips against an all-in opponent (e.g. HU jam) or face
    //     a bet that opened after they last acted. The needsToAct predicate
    //     below correctly decides whether they actually need to act.
    const fta = firstToAct(setup, street, inHand);
    let currentSeat: number | null = null;
    const scanStart: number | null =
      lastActor !== null
        ? nextActive(lastActor, setup.seatCount, canAct)
        : fta;
    if (canAct.length >= 1 && scanStart !== null) {
      let scan: number | null = scanStart;
      for (let i = 0; i < setup.seatCount + 1 && scan !== null; i++) {
        const s = scan;
        const needsToAct =
          canAct.includes(s) && (!acted.has(s) || (live[s] ?? 0) < currentBet);
        if (needsToAct) {
          currentSeat = s;
          break;
        }
        scan = nextActive(s, setup.seatCount, canAct);
        if (scan === scanStart) break; // full loop, nobody needs to act
      }
    }

    const streetComplete = currentSeat === null;

    if (!streetComplete) {
      const toCall = Math.max(0, currentBet - (live[currentSeat as number] ?? 0));
      const minRaiseTo = currentBet + lastRaiseSize;
      // Reopen rule: a seat that has already matched the reopenedBet cannot
      // re-raise. Only seats that haven't acted, or whose live commitment was
      // below the reopenedBet, may raise.
      const currentLive = live[currentSeat as number] ?? 0;
      const canRaiseNow =
        !acted.has(currentSeat as number) || currentLive < reopenedBet;
      view = {
        street,
        currentBet,
        liveThisStreet: live,
        spentTotal,
        pot,
        folded: [...folded],
        allIn: [...allIn],
        inHand,
        currentSeat,
        toCall,
        minRaiseTo,
        lastAggressor,
        streetComplete: false,
        handComplete: false,
        sidePots: computeSidePots(spentTotal, folded),
        reopenedBet,
        canRaise: canRaiseNow,
      };
      return view;
    }
    // street complete: continue to next street (board entry is a UI concern)
  }

  // all four streets complete with no open decision → showdown
  const inHand = allSeats.filter((s) => !folded.has(s));
  const pot = Object.values(spentTotal).reduce((a, b) => a + b, 0);
  return finalize(setup, {
    street: lastStreetProcessed,
    currentBet: 0,
    live: {},
    spentTotal,
    pot,
    folded,
    allIn,
    inHand,
    currentSeat: null,
    lastAggressor: null,
    streetComplete: true,
    handComplete: true,
  });
}

function finalize(
  setup: HandSetup,
  partial: {
    street: Street;
    currentBet: number;
    live: Record<number, number>;
    spentTotal: Record<number, number>;
    pot: number;
    folded: Set<number>;
    allIn: Set<number>;
    inHand: number[];
    currentSeat: number | null;
    lastAggressor: number | null;
    streetComplete: boolean;
    handComplete: boolean;
  }
): HandState {
  return {
    street: partial.street,
    currentBet: partial.currentBet,
    liveThisStreet: partial.live,
    spentTotal: partial.spentTotal,
    pot: partial.pot,
    folded: [...partial.folded],
    allIn: [...partial.allIn],
    inHand: partial.inHand,
    currentSeat: partial.currentSeat,
    toCall: 0,
    minRaiseTo: setup.bb,
    lastAggressor: partial.lastAggressor,
    streetComplete: partial.streetComplete,
    handComplete: partial.handComplete,
    sidePots: computeSidePots(partial.spentTotal, partial.folded),
    reopenedBet: 0,
    canRaise: false,
  };
}

// Attach side pots to the live (non-finalized) view too.
function withSidePots(state: HandState): HandState {
  return {
    ...state,
    sidePots: computeSidePots(state.spentTotal, new Set(state.folded)),
  };
}

// ---------------------------------------------------------------------------
// High-level move helper — used by the UI and by tests so callers never have
// to compute increments by hand. `to` for bet/raise is the TOTAL this-street
// commitment the seat is moving to; the engine converts it to an increment.
// ---------------------------------------------------------------------------

export type Move =
  | { seat: number; type: "fold" | "check" | "call" | "allin" }
  | { seat: number; type: "bet" | "raise"; to: number };

export function moveToAction(setup: HandSetup, actions: Action[], move: Move): Action {
  const st = computeState(setup, actions);
  const live = st.liveThisStreet[move.seat] ?? 0;
  let amount = 0;
  if (move.type === "call") {
    // a call is capped by the remaining stack (all-in call for less)
    const behind =
      startStackOf(setup, move.seat) - (st.spentTotal[move.seat] ?? 0);
    amount = Math.min(Math.max(0, st.currentBet - live), Math.max(0, behind));
  } else if (move.type === "bet" || move.type === "raise") {
    amount = move.to - live;
  } else if (move.type === "allin") {
    const spent = st.spentTotal[move.seat] ?? 0;
    amount = startStackOf(setup, move.seat) - spent;
  }
  return { street: st.street, seat: move.seat, type: move.type, amount };
}

/** apply a sequence of high-level moves, returning the action log + state trace */
export function simulate(
  setup: HandSetup,
  moves: Move[]
): { actions: Action[]; states: HandState[]; final: HandState } {
  const actions: Action[] = [];
  const states: HandState[] = [withSidePots(computeState(setup, actions))];
  for (const m of moves) {
    const a = moveToAction(setup, actions, m);
    actions.push(a);
    states.push(withSidePots(computeState(setup, actions)));
  }
  return { actions, states, final: states[states.length - 1] };
}

export { withSidePots, sbSeat, bbSeat };
