import { db } from "../db/db";
import type { Action, Hand, Player, Session, Street } from "../db/types";
import { computeStreetState, nextSeat } from "./poker";

export interface ActorOrder {
  street: Street;
  orderedSeats: number[];
  currentSeat: number | null;
  currentIndex: number;
}

export async function advanceToSeat(
  hand: Hand,
  actions: Action[],
  players: Player[],
  street: Street,
  targetSeat: number
): Promise<void> {
  let nextOrder = (actions[actions.length - 1]?.order ?? -1) + 1;
  const handDbId = hand.id!;
  const inserts: Omit<Action, "id">[] = [];

  let work = [...actions];
  while (true) {
    const state = computeStreetState(hand, work, street, players);
    const cur = state.currentSeat;
    if (cur === null) break;
    if (cur === targetSeat) break;
    const toCall = state.toCall(cur);
    let type: Action["type"];
    let amount = 0;
    if (toCall === 0) {
      type = "CHECK";
    } else {
      type = "FOLD";
    }
    const action: Omit<Action, "id"> = {
      handId: handDbId,
      order: nextOrder++,
      street,
      seat: cur,
      type,
      amount,
      totalPutIn: amount,
      isAllIn: false,
    };
    inserts.push(action);
    work = [...work, { ...action, id: -inserts.length }];
  }

  if (inserts.length > 0) {
    await db.actions.bulkAdd(inserts);
  }
}

export interface StackUpdate {
  seat: number;
  newStack: number | undefined;
}

export function computeNewStacks(
  hand: Hand,
  actions: Action[],
  players: Player[]
): StackUpdate[] {
  const totalPutIn = new Map<number, number>();
  for (const a of actions) {
    if (a.type === "FOLD" || a.type === "CHECK") continue;
    totalPutIn.set(a.seat, (totalPutIn.get(a.seat) ?? 0) + a.amount);
  }
  const winnings = new Map<number, number>();
  for (const w of hand.winners) {
    winnings.set(w.seat, (winnings.get(w.seat) ?? 0) + w.amount);
  }
  const updates: StackUpdate[] = [];
  for (const p of players) {
    if (p.stack === undefined) continue;
    const put = totalPutIn.get(p.seat) ?? 0;
    const won = winnings.get(p.seat) ?? 0;
    updates.push({ seat: p.seat, newStack: p.stack - put + won });
  }
  return updates;
}

export async function startNextHand(
  session: Session,
  prevHand: Hand,
  players: Player[]
): Promise<number> {
  const now = Date.now();
  const active = players
    .filter((p) => !p.isAway && p.name.trim() !== "")
    .map((p) => p.seat);
  const nextBtn =
    nextSeat(prevHand.buttonSeat, session.seats, active) ?? prevHand.buttonSeat;

  const stacksAtStart = players
    .filter((p) => p.stack !== undefined)
    .map((p) => ({ seat: p.seat, stack: p.stack as number }));

  const handId = await db.hands.add({
    sessionId: session.id!,
    handNo: prevHand.handNo + 1,
    startedAt: now,
    buttonSeat: nextBtn,
    sb: session.sb,
    bb: session.bb,
    ante: session.ante,
    activeSeats: active,
    board: { flop: null, turn: null, river: null },
    pot: 0,
    rake: 0,
    winners: [],
    wentToShowdown: false,
    note: "",
    finalized: false,
    stacksAtStart,
  });
  await db.sessions.update(session.id!, { buttonSeat: nextBtn });
  return handId;
}
