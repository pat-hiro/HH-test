import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../data/db";
import { Actions, Hands, Players, Sessions } from "../../data/repo";
import { makeSetup, nextActive } from "../../engine/setup";
import { computeState, moveToAction } from "../../engine/reducer";
import type { Move } from "../../engine/reducer";
import type { Action as EngineAction, Street } from "../../engine/types";
import type { Action as StoredAction } from "../../data/types";
import PokerTable from "../components/PokerTable";
import type { SeatVM } from "../components/PokerTable";
import BoardCardSheet from "../components/BoardCardSheet";
import { positionLabels } from "../positions";

// ----- helpers --------------------------------------------------------------

function streetTitle(s: Street): string {
  return s === "PF" ? "PREFLOP" : s === "F" ? "FLOP" : s === "T" ? "TURN" : "RIVER";
}

/**
 * Build the engine input from the persisted snapshot. This is the single
 * adapter between storage and the pure reducer — everything below just
 * displays the resulting HandState.
 */
function useEngineState(handId: string | undefined) {
  const hand = useLiveQuery(
    () => (handId ? db.hands.get(handId) : undefined),
    [handId]
  );
  const stored = useLiveQuery(
    () =>
      handId
        ? db.actions
            .where("handId")
            .equals(handId)
            .toArray()
            .then((rs) =>
              rs
                .filter((r) => r.deletedAt === null)
                .sort((a, b) => a.order - b.order)
            )
        : [],
    [handId]
  );

  const setup = useMemo(() => {
    if (!hand) return null;
    const posts = hand.seats.flatMap((s) =>
      s.posted.flatMap((p) =>
        p.kind === "post"
          ? [
              {
                seat: s.seat,
                amount: p.amount,
                ante: s.posted.find((x) => x.kind === "post_ante")?.amount,
              },
            ]
          : []
      )
    );
    return makeSetup({
      seats: hand.seats.map((s) => ({ seat: s.seat, startStack: s.startStack })),
      seatCount: 11, // for rotation logic — actual seats are in hand.seats
      buttonSeat: hand.buttonSeat,
      sb: hand.sb,
      bb: hand.bb,
      bbAnte: hand.ante,
      autoStraddle: hand.autoStraddle,
      straddleAmount: hand.straddleAmount > 0 ? hand.straddleAmount : undefined,
      posts: posts.length > 0 ? posts : undefined,
    });
  }, [hand]);

  const engineActions: EngineAction[] = useMemo(
    () =>
      (stored ?? []).map((a) => ({
        street: a.street,
        seat: a.seat,
        type: a.type,
        amount: a.amount,
      })),
    [stored]
  );

  const state = useMemo(
    () => (setup ? computeState(setup, engineActions) : null),
    [setup, engineActions]
  );

  return { hand, stored: stored ?? [], setup, engineActions, state };
}

// ----- screen ---------------------------------------------------------------

export default function Hand() {
  const { sessionId, handId } = useParams();
  const nav = useNavigate();

  const session = useLiveQuery(
    () => (sessionId ? db.sessions.get(sessionId) : undefined),
    [sessionId]
  );
  const { hand, stored, setup, engineActions, state } = useEngineState(handId);

  const [pending, setPending] = useState<null | "BET" | "RAISE" | "ALL_IN">(null);
  const [draftAmount, setDraftAmount] = useState("");
  const [boardSheetSlot, setBoardSheetSlot] = useState<number | null>(null);

  // auto-open board picker when a street closes and the next street's cards
  // haven't been entered yet. Tracked by a ref so cancel doesn't loop.
  const autoOpenedRef = useRef<Record<Street, boolean>>({
    PF: false, F: false, T: false, R: false,
  });
  useEffect(() => {
    if (!hand || !state) return;
    if (boardSheetSlot !== null || pending !== null) return;
    if (state.handComplete) return;
    if (state.streetComplete) {
      if (state.street === "PF" && !hand.board.flop && !autoOpenedRef.current.PF) {
        autoOpenedRef.current.PF = true;
        setBoardSheetSlot(0);
      } else if (state.street === "F" && !hand.board.turn && !autoOpenedRef.current.F) {
        autoOpenedRef.current.F = true;
        setBoardSheetSlot(3);
      } else if (state.street === "T" && !hand.board.river && !autoOpenedRef.current.T) {
        autoOpenedRef.current.T = true;
        setBoardSheetSlot(4);
      }
    }
  }, [hand, state, boardSheetSlot, pending]);

  if (!session || !hand || !setup || !state) return null;

  // ----- VM (read-only) ------------------------------------------------------

  const activeSeats = hand.seats.map((s) => s.seat);
  const positions = positionLabels(activeSeats, hand.buttonSeat);
  const foldedSet = new Set(state.folded);
  const allInSet = new Set(state.allIn);
  const heroSeat = session.heroSeat;
  const board: (string | null)[] = [
    hand.board.flop?.[0] ?? null,
    hand.board.flop?.[1] ?? null,
    hand.board.flop?.[2] ?? null,
    hand.board.turn,
    hand.board.river,
  ];

  const seatVMs: SeatVM[] = hand.seats.map((s) => ({
    seat: s.seat,
    position: positions.get(s.seat) ?? "",
    name: s.name,
    stack: s.startStack - (state.spentTotal[s.seat] ?? 0),
    isHero: s.seat === heroSeat,
    isBTN: s.seat === hand.buttonSeat,
    isCurrent: s.seat === state.currentSeat,
    isFolded: foldedSet.has(s.seat),
    isAllIn: allInSet.has(s.seat),
    cards:
      s.seat === heroSeat && hand.heroCards ? hand.heroCards : null,
    liveBet: state.liveThisStreet[s.seat] ?? 0,
  }));

  // ----- mutations ----------------------------------------------------------

  async function persist(move: Move) {
    if (!handId) return;
    const a = moveToAction(setup!, engineActions, move);
    const order = stored.length;
    await Actions.create({
      handId,
      order,
      street: a.street,
      seat: a.seat,
      type: a.type,
      amount: a.amount,
      isAllIn: a.type === "allin",
    });
  }

  const onTapSeat = async (seat: number) => {
    if (state.currentSeat === null) return;
    if (state.currentSeat === seat) return;
    if (foldedSet.has(seat) || allInSet.has(seat)) return;
    // generate fold/check moves until the action reaches `seat`
    if (!handId) return;
    const moves: Move[] = [];
    let cur = state.currentSeat;
    let work = [...engineActions];
    let safety = 30;
    while (cur !== seat && safety-- > 0) {
      const v = computeState(setup, work);
      if (v.currentSeat === null) break;
      const move: Move =
        v.toCall > 0 ? { seat: v.currentSeat, type: "fold" } : { seat: v.currentSeat, type: "check" };
      moves.push(move);
      const ea = moveToAction(setup, work, move);
      work = [...work, ea];
      cur = v.currentSeat === seat ? seat : work[work.length - 1].seat;
      const nv = computeState(setup, work);
      if (nv.currentSeat === seat) break;
    }
    if (moves.length === 0) return;
    const newRows: Omit<StoredAction, "id" | "updatedAt" | "deletedAt">[] = [];
    let baseOrder = stored.length;
    let progress = [...engineActions];
    for (const m of moves) {
      const ea = moveToAction(setup, progress, m);
      newRows.push({
        handId,
        order: baseOrder++,
        street: ea.street,
        seat: ea.seat,
        type: ea.type,
        amount: ea.amount,
        isAllIn: false,
      });
      progress = [...progress, ea];
    }
    await Actions.bulkCreate(newRows);
  };

  const onTapBoardSlot = (i: number) => setBoardSheetSlot(i);

  const submitBoard = async (slots: (string | null)[]) => {
    const flop =
      slots[0] && slots[1] && slots[2]
        ? ([slots[0], slots[1], slots[2]] as [string, string, string])
        : null;
    await Hands.update(hand.id, {
      board: { flop, turn: slots[3] ?? null, river: slots[4] ?? null },
    });
    setBoardSheetSlot(null);
  };

  const clearBoard = async () => {
    await Hands.update(hand.id, { board: { flop: null, turn: null, river: null } });
    setBoardSheetSlot(null);
  };

  const onFold = () =>
    state.currentSeat !== null && persist({ seat: state.currentSeat, type: "fold" });
  const onCheck = () =>
    state.currentSeat !== null && persist({ seat: state.currentSeat, type: "check" });
  const onCall = () =>
    state.currentSeat !== null && persist({ seat: state.currentSeat, type: "call" });

  const openBet = () => {
    setPending("BET");
    setDraftAmount(String(hand.bb));
  };
  const openRaise = () => {
    setPending("RAISE");
    setDraftAmount(String(state.minRaiseTo));
  };
  const openAllIn = () => {
    if (state.currentSeat === null) return;
    const seat = hand.seats.find((s) => s.seat === state.currentSeat);
    const remaining = seat
      ? Math.max(0, seat.startStack - (state.spentTotal[seat.seat] ?? 0))
      : 0;
    setPending("ALL_IN");
    setDraftAmount(String(remaining));
  };

  const submitPending = async () => {
    if (state.currentSeat === null) return;
    const amt = parseFloat(draftAmount) || 0;
    if (pending === "BET") {
      await persist({ seat: state.currentSeat, type: "bet", to: amt });
    } else if (pending === "RAISE") {
      await persist({ seat: state.currentSeat, type: "raise", to: amt });
    } else if (pending === "ALL_IN") {
      await persist({ seat: state.currentSeat, type: "allin" });
    }
    setPending(null);
    setDraftAmount("");
  };

  const undo = async () => {
    if (!handId) return;
    await Actions.popLast(handId);
  };

  const foldAll = async () => {
    if (!handId || state.currentSeat === null) return;
    // fold every still-acting seat except Hero (or the current actor if Hero is gone)
    const surviving = state.inHand.filter((s) => !allInSet.has(s));
    const keep =
      heroSeat !== null && surviving.includes(heroSeat) ? heroSeat : state.currentSeat;
    const baseOrder = stored.length;
    const rows = surviving
      .filter((s) => s !== keep)
      .map((s, i) => ({
        handId,
        order: baseOrder + i,
        street: state.street,
        seat: s,
        type: "fold" as const,
        amount: 0,
        isAllIn: false,
      }));
    if (rows.length > 0) await Actions.bulkCreate(rows);
  };

  const nextHand = async () => {
    // finalize current hand if not finalized
    if (!hand.finalized) {
      const survivors = state.inHand;
      const winners =
        survivors.length === 1
          ? [{ seat: survivors[0], amount: state.pot }]
          : hand.result.winners;
      await Hands.update(hand.id, {
        finalized: true,
        endedAt: Date.now(),
        pot: state.pot,
        result: { ...hand.result, winners },
      });
    }
    // rotate BTN to next active seat, update player stacks
    const next = nextActive(hand.buttonSeat, session.seatCount, activeSeats) ?? hand.buttonSeat;
    // bump stacks
    const roster = await Players.forSession(session.id);
    for (const p of roster) {
      const snap = hand.seats.find((s) => s.seat === p.seat);
      if (!snap) continue;
      const delta =
        (hand.result.winners.find((w) => w.seat === p.seat)?.amount ??
          (state.inHand.length === 1 && state.inHand[0] === p.seat ? state.pot : 0)) -
        (state.spentTotal[p.seat] ?? 0);
      const newStack = (p.stack ?? snap.startStack) + delta;
      if (newStack !== p.stack) await Players.update(p.id, { stack: newStack });
    }
    await Sessions.update(session.id, { buttonSeat: next });

    // create next hand snapshot
    const prev = await Hands.lastForSession(session.id);
    const handNo = (prev?.handNo ?? hand.handNo) + 1;
    const updatedRoster = await Players.forSession(session.id);
    const seatsSnap = updatedRoster
      .filter((p) => !p.isAway && p.name.trim() !== "")
      .map((p) => ({
        seat: p.seat,
        name: p.name,
        startStack: p.stack ?? 0,
        posted: [] as { kind: "post" | "post_ante"; amount: number }[],
      }));
    const nh = await Hands.create({
      sessionId: session.id,
      handNo,
      startedAt: Date.now(),
      endedAt: null,
      buttonSeat: next,
      sb: hand.sb,
      bb: hand.bb,
      ante: hand.ante,
      autoStraddle: hand.autoStraddle,
      straddleAmount: hand.straddleAmount,
      seats: seatsSnap,
      board: { flop: null, turn: null, river: null },
      heroCards: null,
      result: { winners: [], wentToShowdown: false, knownCards: [] },
      pot: 0,
      rake: 0,
      note: "",
      tags: [],
      finalized: false,
    });
    nav(`/sessions/${session.id}/hands/${nh.id}`);
  };

  // ----- render -------------------------------------------------------------

  const canCheck = state.toCall === 0;
  const canCall = state.toCall > 0;
  const canBet = state.currentBet === 0 && state.currentSeat !== null;
  const canRaise = state.currentBet > 0 && state.currentSeat !== null && !canCheck;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center px-3 py-2 border-b border-neutral-800">
        <button onClick={() => nav(`/sessions/${session.id}/setup`)} className="text-emerald-400 text-lg">‹</button>
        <button onClick={undo} className="ml-3 text-rose-400 text-lg">↻</button>
        <div className="flex-1 text-center font-bold tracking-wider">{streetTitle(state.street)}</div>
        <div className="text-xs text-neutral-500">#{hand.handNo}</div>
      </div>

      <div className="px-2 pt-2">
        <PokerTable
          totalSeats={session.seatCount}
          seats={seatVMs}
          pot={state.pot}
          streetLabel={streetTitle(state.street)}
          board={board}
          onTapSeat={onTapSeat}
          onTapBoardSlot={onTapBoardSlot}
        />
      </div>

      <div className="flex-1 p-3 space-y-2">
        {state.handComplete ? (
          <button onClick={nextHand} className="w-full py-4 bg-emerald-600 rounded font-bold text-lg">
            Next Hand ▶
          </button>
        ) : (
          <>
            <div className="flex gap-2 items-center">
              <button onClick={() => nav(`/sessions/${session.id}/setup`)} className="px-4 py-2 bg-neutral-700 rounded text-sm">
                Back
              </button>
              <div className="ml-auto flex gap-2">
                {state.street === "PF" ? (
                  <button onClick={foldAll} className="px-4 py-2 bg-rose-500 rounded text-sm font-bold">
                    Fold All
                  </button>
                ) : null}
              </div>
            </div>

            {pending ? (
              <div className="space-y-2">
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    inputMode="decimal"
                    onFocus={(e) => e.currentTarget.select()}
                    value={draftAmount}
                    onChange={(e) => setDraftAmount(e.target.value)}
                    className="flex-1 text-2xl font-mono"
                  />
                  <button
                    onClick={submitPending}
                    className="px-6 py-3 bg-emerald-600 rounded font-bold"
                  >
                    {pending === "RAISE" ? "Raise" : pending === "BET" ? "Bet" : "All-in"}
                  </button>
                  <button
                    onClick={() => { setPending(null); setDraftAmount(""); }}
                    className="px-3 py-3 bg-rose-500 rounded"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ) : (
              <>
                {canCall && (
                  <button onClick={onCall} className="w-full py-4 bg-blue-500 rounded font-bold text-lg">
                    Call {state.toCall}
                  </button>
                )}
                {canCheck && state.currentSeat !== null && (
                  <button onClick={onCheck} className="w-full py-4 bg-blue-500 rounded font-bold text-lg">
                    Check
                  </button>
                )}
                {canRaise && (
                  <button onClick={openRaise} className="w-full py-4 bg-emerald-600 rounded font-bold text-lg">
                    Raise
                  </button>
                )}
                {canBet && (
                  <button onClick={openBet} className="w-full py-4 bg-emerald-600 rounded font-bold text-lg">
                    Bet
                  </button>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={onFold}
                    disabled={state.currentSeat === null}
                    className="py-4 bg-rose-500 rounded font-bold text-lg disabled:opacity-40"
                  >
                    Fold
                  </button>
                  <button
                    onClick={openAllIn}
                    disabled={state.currentSeat === null}
                    className="py-4 bg-amber-500 rounded font-bold text-lg disabled:opacity-40"
                  >
                    All-in
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {boardSheetSlot !== null && (
        <BoardCardSheet
          initialBoard={board}
          startSlot={boardSheetSlot}
          hero={hand.heroCards}
          exclude={board.filter((c): c is string => !!c)}
          onSubmit={submitBoard}
          onCancel={() => setBoardSheetSlot(null)}
          onClear={clearBoard}
        />
      )}
    </div>
  );
}
