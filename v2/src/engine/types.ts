// ---------------------------------------------------------------------------
// v2 poker engine — types
//
// Design rule (fixes v1 root cause): there is ONE source of truth for the
// betting state. The reducer derives whose turn it is, the current bet, the
// amount to call, the pot, and side pots — purely from:
//   (a) an immutable HandSetup (seats, stacks, button, and the forced bets
//       that are computed deterministically at hand start), and
//   (b) an ordered list of voluntary Actions whose `amount` is always the
//       INCREMENT a seat puts in with that action (never a running total).
//
// Blinds / antes / straddles / posts are NOT user actions; they are seeded
// from the setup, so there is no async race that can double-post them.
// ---------------------------------------------------------------------------

export type Street = "PF" | "F" | "T" | "R";

export type ActionType = "fold" | "check" | "call" | "bet" | "raise" | "allin";

export interface SeatSetup {
  seat: number;
  startStack: number;
}

export type ForcedKind = "sb" | "bb" | "straddle" | "post" | "ante";

export interface ForcedBet {
  seat: number;
  amount: number;
  kind: ForcedKind;
  /** live bets set the bar others must match (sb/bb/straddle/post). antes are dead (pot-only). */
  live: boolean;
}

export interface HandSetup {
  /** active seats only (folded/away excluded happens upstream) */
  seats: SeatSetup[];
  /** total seats at the table, for clockwise rotation (seats are numbered 1..seatCount) */
  seatCount: number;
  buttonSeat: number;
  bb: number;
  /** computed at hand start: sb, bb, straddle, post, ante */
  forced: ForcedBet[];
}

export interface Action {
  street: Street;
  seat: number;
  type: ActionType;
  /** INCREMENT added by this action. 0 for fold/check. */
  amount: number;
}

export interface SidePot {
  amount: number;
  eligible: number[];
}

export interface HandState {
  street: Street;
  /** max live commitment on the current street */
  currentBet: number;
  /** live chips committed THIS street, per seat */
  liveThisStreet: Record<number, number>;
  /** total chips spent across the whole hand (incl. forced + antes), per seat */
  spentTotal: Record<number, number>;
  pot: number;
  folded: number[];
  allIn: number[];
  /** seats still in the hand (not folded) */
  inHand: number[];
  /** whose turn it is, or null if the street is complete / hand is over */
  currentSeat: number | null;
  /** for currentSeat: chips needed to call */
  toCall: number;
  /** total this-street commitment a legal raise must reach */
  minRaiseTo: number;
  lastAggressor: number | null;
  streetComplete: boolean;
  handComplete: boolean;
  sidePots: SidePot[];
}
