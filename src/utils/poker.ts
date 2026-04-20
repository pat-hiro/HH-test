import type { Action, Hand, Player, Street } from "../db/types";

export function nextSeat(
  from: number,
  seatsTotal: number,
  eligible: number[]
): number | null {
  if (eligible.length === 0) return null;
  for (let i = 1; i <= seatsTotal; i++) {
    const s = ((from - 1 + i) % seatsTotal) + 1;
    if (eligible.includes(s)) return s;
  }
  return null;
}

export function sbSeat(buttonSeat: number, seats: number, eligible: number[]): number | null {
  if (eligible.length === 2) {
    return buttonSeat;
  }
  return nextSeat(buttonSeat, seats, eligible);
}

export function bbSeat(buttonSeat: number, seats: number, eligible: number[]): number | null {
  const sb = sbSeat(buttonSeat, seats, eligible);
  if (sb === null) return null;
  return nextSeat(sb, seats, eligible);
}

export interface StreetState {
  currentSeat: number | null;
  currentBet: number;
  lastRaiseSize: number;
  toCall: (seat: number) => number;
  pot: number;
  remaining: number[];
  done: boolean;
}

export function computeStreetState(
  hand: Hand,
  actions: Action[],
  street: Street,
  players: Player[]
): StreetState {
  const seatsTotal = players.length === 0 ? 9 : Math.max(...players.map((p) => p.seat));
  const streetActions = actions.filter((a) => a.street === street);

  const folded = new Set<number>();
  for (const a of actions) {
    if (a.type === "FOLD") folded.add(a.seat);
  }

  const allIn = new Set<number>();
  for (const a of actions) {
    if (a.isAllIn) allIn.add(a.seat);
  }

  const active = hand.activeSeats.filter((s) => !folded.has(s));
  const canAct = active.filter((s) => !allIn.has(s));

  const putInThisStreet = new Map<number, number>();
  for (const a of streetActions) {
    if (
      a.type === "FOLD" ||
      a.type === "CHECK" ||
      a.type === "ANTE"
    )
      continue;
    putInThisStreet.set(a.seat, (putInThisStreet.get(a.seat) ?? 0) + a.amount);
  }

  const currentBet = Math.max(0, ...Array.from(putInThisStreet.values()));
  const lastRaiseAction = [...streetActions]
    .reverse()
    .find((a) => a.type === "RAISE" || a.type === "BET");
  const lastRaiseSize = lastRaiseAction ? lastRaiseAction.amount : 0;

  let potFromPrior = 0;
  for (const a of actions) {
    if (a.street === street) continue;
    if (a.type === "FOLD" || a.type === "CHECK") continue;
    potFromPrior += a.amount;
  }
  let potThisStreet = 0;
  for (const v of putInThisStreet.values()) potThisStreet += v;
  const pot = potFromPrior + potThisStreet;

  let firstToAct: number;
  if (street === "PF") {
    const bb = bbSeat(hand.buttonSeat, seatsTotal, hand.activeSeats);
    firstToAct =
      nextSeat(bb ?? hand.buttonSeat, seatsTotal, hand.activeSeats) ?? (bb ?? hand.buttonSeat);
  } else {
    const sb = sbSeat(hand.buttonSeat, seatsTotal, hand.activeSeats);
    firstToAct = sb ?? hand.buttonSeat;
  }

  const voluntaryActs = streetActions.filter(
    (a) =>
      a.type !== "BLIND_SB" &&
      a.type !== "BLIND_BB" &&
      a.type !== "ANTE" &&
      a.type !== "STRADDLE" &&
      a.type !== "POST"
  );

  const actedThisStreet = new Set(voluntaryActs.map((a) => a.seat));

  let currentSeat: number | null = null;
  if (canAct.length <= 1) {
    currentSeat = null;
  } else {
    const lastActor = voluntaryActs.length > 0 ? voluntaryActs[voluntaryActs.length - 1].seat : null;
    const start = lastActor === null ? firstToAct : lastActor;
    let scanFrom = lastActor === null ? firstToAct : start;
    if (lastActor !== null) {
      scanFrom = nextSeat(start, seatsTotal, canAct) ?? start;
    } else {
      if (!canAct.includes(scanFrom)) {
        scanFrom = nextSeat(scanFrom, seatsTotal, canAct) ?? scanFrom;
      }
    }

    for (let i = 0; i < seatsTotal + 1; i++) {
      const s = scanFrom;
      const putIn = putInThisStreet.get(s) ?? 0;
      const needsToAct =
        !actedThisStreet.has(s) || putIn < currentBet;
      if (canAct.includes(s) && needsToAct) {
        currentSeat = s;
        break;
      }
      const nxt = nextSeat(scanFrom, seatsTotal, canAct);
      if (nxt === null || nxt === scanFrom) break;
      scanFrom = nxt;
    }
  }

  const done = currentSeat === null;

  const toCall = (seat: number): number => {
    const put = putInThisStreet.get(seat) ?? 0;
    return Math.max(0, currentBet - put);
  };

  return {
    currentSeat,
    currentBet,
    lastRaiseSize,
    toCall,
    pot,
    remaining: active,
    done,
  };
}

export function handIsOver(hand: Hand, actions: Action[]): boolean {
  const folded = new Set<number>();
  for (const a of actions) if (a.type === "FOLD") folded.add(a.seat);
  const active = hand.activeSeats.filter((s) => !folded.has(s));
  return active.length <= 1;
}
