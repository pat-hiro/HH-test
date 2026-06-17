import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../data/db";
import { Actions, Events, Hands, Players, Sessions, Settings } from "../../data/repo";
import { makeSetup, nextActive } from "../../engine/setup";
import { computeState, moveToAction } from "../../engine/reducer";
import type { Move } from "../../engine/reducer";
import type { Action as EngineAction, Street } from "../../engine/types";
import type { Action as StoredAction } from "../../data/types";
import PokerTable from "../components/PokerTable";
import type { SeatVM } from "../components/PokerTable";
import PlayingCard from "../components/PlayingCard";
import BoardCardSheet from "../components/BoardCardSheet";
import BetSizeSheet from "../components/BetSizeSheet";
import CardPickerSheet from "../components/CardPickerSheet";
import NoteSheet from "../components/NoteSheet";
import EventSheet from "../components/EventSheet";
import { positionLabels } from "../positions";
import { fmtChips } from "../fmt";

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
      // upper bound for the modular rotation: max seat NUMBER actually present
      // in the hand (since unnamed seats are excluded from the snapshot)
      seatCount: Math.max(...hand.seats.map((s) => s.seat), 2),
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
  const settings = useLiveQuery(() => Settings.get(), []);
  const handEvents = useLiveQuery(
    () => (handId ? Events.forHand(handId) : []),
    [handId]
  );
  const { hand, stored, setup, engineActions, state } = useEngineState(handId);

  const [pending, setPending] = useState<null | "BET" | "RAISE" | "ALL_IN">(null);
  const [allInDraft, setAllInDraft] = useState<number>(0);
  const [boardSheetSlot, setBoardSheetSlot] = useState<number | null>(null);
  const [heroCardsOpen, setHeroCardsOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [knownCardsSeat, setKnownCardsSeat] = useState<number | null>(null);

  // result-entry state, seeded once when the hand becomes complete
  const resultSeededRef = useRef(false);
  const [showdown, setShowdown] = useState(false);
  const [shares, setShares] = useState<Record<number, string>>({});
  const [knownCards, setKnownCards] = useState<Record<number, [string, string]>>({});

  // Board / completion logic. Three situations:
  //  - handFoldedOut: only one player left → result, no board needed.
  //  - betting still open (currentSeat set): require the CURRENT street's
  //    board cards before action can resume.
  //  - betting done but ≥2 players remain (showdown or all-in run-out):
  //    the full board must be dealt before we record the result.
  const handFoldedOut = !!state && state.inHand.length <= 1;
  const bettingDone = !!state && state.currentSeat === null;

  const boardRequirement = (() => {
    if (!hand || !state) return null;
    if (handFoldedOut) return null;
    const haveFlop = !!hand.board.flop;
    const haveTurn = !!hand.board.turn;
    const haveRiver = !!hand.board.river;
    if (!bettingDone) {
      // normal in-street board requirement
      if (state.street === "F" && !haveFlop) return { slots: [0, 1, 2], startSlot: 0 };
      if (state.street === "T" && !haveTurn) return { slots: [3], startSlot: 3 };
      if (state.street === "R" && !haveRiver) return { slots: [4], startSlot: 4 };
      return null;
    }
    // betting done, multiway → deal the rest of the board (run-out / showdown)
    if (!haveFlop) return { slots: [0, 1, 2], startSlot: 0 };
    if (!haveTurn) return { slots: [3], startSlot: 3 };
    if (!haveRiver) return { slots: [4], startSlot: 4 };
    return null;
  })();

  // Show the result panel only once betting is done AND any required run-out
  // board has been entered (or the hand folded out).
  const showResult =
    !!state && (handFoldedOut || (bettingDone && boardRequirement === null));

  // Prompt the user for the new street's board cards exactly once when the
  // engine first crosses into F / T / R. After they dismiss (Cancel or
  // Confirm with partial entry), don't re-prompt — the user can tap the
  // board slots on the table anytime to fill missing cards in later.
  const promptedRef = useRef<Record<Street, boolean>>({
    PF: false, F: false, T: false, R: false,
  });
  useEffect(() => {
    if (!boardRequirement) return;
    if (boardSheetSlot !== null) return;
    if (pending !== null) return;
    if (!state) return;
    if (promptedRef.current[state.street]) return;
    promptedRef.current[state.street] = true;
    setBoardSheetSlot(boardRequirement.startSlot);
  }, [boardRequirement, boardSheetSlot, pending, state]);

  // seed the result-entry panel once the hand reaches result (reset if undone)
  useEffect(() => {
    if (!hand || !state) return;
    if (!showResult) {
      resultSeededRef.current = false;
      return;
    }
    if (resultSeededRef.current) return;
    resultSeededRef.current = true;
    const survivors = state.inHand;
    if (hand.finalized && hand.result.winners.length > 0) {
      const m: Record<number, string> = {};
      for (const w of hand.result.winners) m[w.seat] = String(w.amount);
      setShares(m);
      setShowdown(hand.result.wentToShowdown);
      const kc: Record<number, [string, string]> = {};
      for (const k of hand.result.knownCards) kc[k.seat] = k.cards;
      setKnownCards(kc);
    } else {
      setShares(survivors.length === 1 ? { [survivors[0]]: String(state.pot) } : {});
      setShowdown(survivors.length > 1);
      setKnownCards({});
    }
  }, [hand, state, showResult]);

  if (!session || !hand || !setup || !state || !settings) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-neutral-500 gap-3 text-sm">
        <div>Loading hand…</div>
        {handId && !hand && (
          <div className="text-xs text-rose-400 text-center px-6">
            ハンドが見つかりません。
            <br />
            URL: /sessions/{sessionId}/hands/{handId}
          </div>
        )}
        <button
          onClick={() => nav(sessionId ? `/sessions/${sessionId}/setup` : "/")}
          className="mt-2 px-4 py-2 bg-neutral-800 rounded"
        >
          Setup に戻る
        </button>
      </div>
    );
  }

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

  // map each seat to its forced-bet role for chip coloring (preflop only)
  const forcedKindBySeat = new Map<number, "sb" | "bb" | "straddle" | "post">();
  const anteBySeat = new Map<number, number>();
  for (const f of setup.forced) {
    if (f.kind === "ante") {
      anteBySeat.set(f.seat, (anteBySeat.get(f.seat) ?? 0) + f.amount);
      continue;
    }
    // straddle/post outrank sb/bb if a seat somehow has both
    const prev = forcedKindBySeat.get(f.seat);
    if (!prev || f.kind === "straddle" || f.kind === "post") {
      forcedKindBySeat.set(f.seat, f.kind);
    }
  }

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
      s.seat === heroSeat && hand.heroCards
        ? hand.heroCards
        : knownCards[s.seat] ?? null,
    liveBet: state.liveThisStreet[s.seat] ?? 0,
    blind: state.street === "PF" ? forcedKindBySeat.get(s.seat) ?? null : null,
    ante: state.street === "PF" ? anteBySeat.get(s.seat) ?? 0 : 0,
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
    if (!handId) return;
    // Defensive: refuse to advance to a seat that the engine never sees (e.g.
    // a freshly emptied chair that's no longer in the hand snapshot). Without
    // this guard, the loop below would fold every remaining seat in pursuit
    // of an unreachable target — which is what produced the
    // "Unknown プレイヤーをタップしたらハンドが終了した" report.
    if (!activeSeats.includes(seat)) return;

    // Generate fold/check moves until the action reaches `seat`.
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

    // Look at the resulting engine state. If the auto-fold cascade ends the
    // hand or never actually reaches the tapped seat, ask the user before
    // committing — otherwise a single mis-tap silently terminates the hand.
    const projected = computeState(setup, work);
    const foldCount = moves.filter((m) => m.type === "fold").length;
    const wouldEndHand =
      projected.inHand.length <= 1 || projected.handComplete;
    const targetReached = projected.currentSeat === seat;
    if (wouldEndHand) {
      if (
        !confirm(
          `このタップで ${foldCount} 人が fold してハンドが終了します。続行しますか？`
        )
      )
        return;
    } else if (!targetReached && foldCount >= 3) {
      if (
        !confirm(
          `タップした席まで届かず、${foldCount} 人が fold します。続行しますか？`
        )
      )
        return;
    }

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
    // partial entry is allowed: keep any non-null flop slot, collapse to null
    // only when ALL three are empty
    const hasAnyFlop = !!(slots[0] || slots[1] || slots[2]);
    const flop = hasAnyFlop
      ? ([slots[0] ?? null, slots[1] ?? null, slots[2] ?? null] as [
          string | null,
          string | null,
          string | null,
        ])
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

  const openBet = () => setPending("BET");
  const openRaise = () => setPending("RAISE");
  const openAllIn = () => {
    if (state.currentSeat === null) return;
    const seat = hand.seats.find((s) => s.seat === state.currentSeat);
    const remaining = seat
      ? Math.max(0, seat.startStack - (state.spentTotal[seat.seat] ?? 0))
      : 0;
    setAllInDraft(remaining);
    setPending("ALL_IN");
  };

  const submitAmount = async (amt: number) => {
    if (state.currentSeat === null || !handId) return;
    if (pending === "BET") {
      await persist({ seat: state.currentSeat, type: "bet", to: amt });
    } else if (pending === "RAISE") {
      await persist({ seat: state.currentSeat, type: "raise", to: amt });
    } else if (pending === "ALL_IN") {
      // honor the user's amount (lets them correct an outdated snapshot stack)
      await Actions.create({
        handId,
        order: stored.length,
        street: state.street,
        seat: state.currentSeat,
        type: "allin",
        amount: amt,
        isAllIn: true,
      });
    }
    setPending(null);
  };

  // straddle amount in the current hand (if any) — needed for "str"-basis presets
  const handStraddleAmount = setup.forced
    .filter((f) => f.kind === "straddle")
    .reduce((max, f) => Math.max(max, f.amount), 0);

  const presetCtx = {
    bb: hand.bb,
    pot: state.pot,
    toCall: state.toCall,
    straddleAmount: handStraddleAmount,
    currentBet: state.currentBet,
  };

  const presetsForPending = (): typeof settings.pfRaise => {
    if (pending === "BET") return settings.postflopBet;
    if (pending === "RAISE") {
      if (state.street === "PF") {
        return handStraddleAmount > 0 ? settings.pfRaiseStraddle : settings.pfRaise;
      }
      return settings.postflopRaise;
    }
    return [];
  };
  const minForPending = (): number => {
    if (pending === "BET") return hand.bb;
    if (pending === "RAISE") return state.minRaiseTo;
    return 0;
  };

  const undo = async () => {
    if (!handId) return;
    await Actions.popLast(handId);
  };

  /** Undo every action on the current street + clear the board cards that
   *  street introduced. Handy when the user goes "no wait, that whole flop
   *  was different" and wants a single tap to back out the street. */
  const undoStreet = async () => {
    if (!handId || !state) return;
    const cur = state.street;
    const ofStreet = stored.filter((a) => a.street === cur);
    for (const a of ofStreet) await Actions.remove(a.id);
    if (cur === "F") {
      await Hands.update(hand.id, {
        board: { ...hand.board, flop: null, turn: null, river: null },
      });
    } else if (cur === "T") {
      await Hands.update(hand.id, {
        board: { ...hand.board, turn: null, river: null },
      });
    } else if (cur === "R") {
      await Hands.update(hand.id, { board: { ...hand.board, river: null } });
    }
    // also wipe the auto-prompt memo so the next visit re-prompts cleanly
    promptedRef.current[cur] = false;
  };

  const saveHeroCards = async (cards: (string | null)[]) => {
    const c0 = cards[0];
    const c1 = cards[1];
    await Hands.update(hand.id, {
      heroCards: c0 && c1 ? [c0, c1] : null,
    });
    setHeroCardsOpen(false);
  };

  const saveNote = async (note: string) => {
    await Hands.update(hand.id, { note });
    setNoteOpen(false);
  };

  const saveKnownCards = async (seat: number, cards: (string | null)[]) => {
    const c0 = cards[0];
    const c1 = cards[1];
    setKnownCards((prev) => {
      const next = { ...prev };
      if (c0 && c1) next[seat] = [c0, c1];
      else delete next[seat];
      return next;
    });
    setKnownCardsSeat(null);
  };

  // ----- result entry (shown when the hand is complete) --------------------

  const survivors = state.inHand;
  const sharesTotal = Object.values(shares).reduce(
    (s, v) => s + (parseFloat(v) || 0),
    0
  );
  const sharesRemainder = state.pot - sharesTotal;

  /** auto-assign a single side pot to one winner (overwrites that seat's
   *  current share by adding the pot's amount; existing shares for other
   *  seats are kept). */
  const assignSidePot = (potAmount: number, winnerSeat: number) => {
    setShares((prev) => {
      const cur = parseFloat(prev[winnerSeat] ?? "0") || 0;
      return { ...prev, [winnerSeat]: String(cur + potAmount) };
    });
  };
  const clearShares = () => setShares({});

  const setShare = (seat: number, v: string) =>
    setShares((prev) => ({ ...prev, [seat]: v }));
  const assignAllTo = (seat: number) =>
    setShares({ [seat]: String(state.pot) });
  const splitEvenly = () => {
    if (survivors.length === 0) return;
    const each = Math.floor(state.pot / survivors.length);
    const rem = state.pot - each * survivors.length;
    const m: Record<number, string> = {};
    survivors.forEach((s, i) => {
      m[s] = String(each + (i === 0 ? rem : 0));
    });
    setShares(m);
  };

  const foldAll = async () => {
    if (!handId) return;
    // Fold every seat that still OWES chips on this street (live < currentBet).
    // Seats that already matched the current bet — callers, the bettor /
    // raiser, BB option in a limped pot, anyone who said "call" — stay in the
    // hand. So a bet+call followed by Fold All correctly leaves the bettor
    // and caller to see the next street. Already all-in seats stay in too.
    const toFold = state.inHand.filter((s) => {
      if (allInSet.has(s)) return false;
      const live = state.liveThisStreet[s] ?? 0;
      return live < state.currentBet;
    });
    if (toFold.length === 0) return;
    let order = stored.length;
    const rows = toFold.map((s) => ({
      handId,
      order: order++,
      street: state.street,
      seat: s,
      type: "fold" as const,
      amount: 0,
      isAllIn: false,
    }));
    await Actions.bulkCreate(rows);
  };

  // Postflop "Check Thru" — emit a CHECK action for every remaining seat
  // until the street closes. Used by the user when nobody bet (or after a
  // bet that everyone called) to fast-forward straight to the next street.
  // Stops if anyone faces a non-zero toCall (i.e. nothing-to-check).
  /** Check the rest of the way around THIS street only — don't bleed into
   *  the next street even if the engine would advance. */
  const checkThru = async () => {
    if (!handId || !state) return;
    const startStreet = state.street;
    let work = [...engineActions];
    let baseOrder = stored.length;
    const newRows: Omit<StoredAction, "id" | "updatedAt" | "deletedAt">[] = [];
    let safety = 30;
    while (safety-- > 0) {
      const st = computeState(setup, work);
      if (st.currentSeat === null) break;
      if (st.street !== startStreet) break; // don't carry into the next street
      if (st.toCall > 0) break; // someone has to call — abort
      const ea = moveToAction(setup, work, { seat: st.currentSeat, type: "check" });
      newRows.push({
        handId,
        order: baseOrder++,
        street: ea.street,
        seat: ea.seat,
        type: ea.type,
        amount: ea.amount,
        isAllIn: false,
      });
      work = [...work, ea];
    }
    if (newRows.length > 0) await Actions.bulkCreate(newRows);
  };

  // build the winners array from the result-entry shares
  const buildWinners = (): { seat: number; amount: number }[] => {
    const ws = Object.entries(shares)
      .map(([seat, v]) => ({ seat: Number(seat), amount: parseFloat(v) || 0 }))
      .filter((w) => w.amount > 0);
    if (ws.length === 0 && survivors.length === 1) {
      return [{ seat: survivors[0], amount: state.pot }];
    }
    return ws;
  };

  const nextHand = async () => {
    const winners = buildWinners();
    const knownArr = Object.entries(knownCards).map(([seat, cards]) => ({
      seat: Number(seat),
      cards,
    }));
    await Hands.update(hand.id, {
      finalized: true,
      endedAt: Date.now(),
      pot: state.pot,
      result: {
        winners,
        wentToShowdown: showdown,
        knownCards: knownArr,
      },
    });

    // rotate BTN to next active seat, update player stacks from the result
    const next = nextActive(hand.buttonSeat, session.seatCount, activeSeats) ?? hand.buttonSeat;
    const roster = await Players.forSession(session.id);
    for (const p of roster) {
      const snap = hand.seats.find((s) => s.seat === p.seat);
      if (!snap) continue;
      const won = winners.find((w) => w.seat === p.seat)?.amount ?? 0;
      const delta = won - (state.spentTotal[p.seat] ?? 0);
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

  // Board entry no longer blocks action — the user can skip remembering
  // any board card and continue logging. boardRequirement exists only to
  // drive the one-time auto-prompt above.
  const canCheck = state.toCall === 0;
  const canCall = state.toCall > 0;
  const canBet = state.currentBet === 0 && state.currentSeat !== null;
  // BB option / facing a raise — both allow Raise. Show alongside Check when
  // there's a live bet but I owe nothing (e.g., BB in a limped pot). Suppressed
  // when state.canRaise is false (e.g., facing a partial all-in: call only).
  const canRaise =
    state.currentBet > 0 && state.currentSeat !== null && state.canRaise;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center px-3 py-2 border-b border-neutral-800">
        <button onClick={() => nav(`/sessions/${session.id}/setup`)} className="text-emerald-400 text-lg">‹</button>
        <button onClick={undoStreet} title="1ストリート戻す" className="ml-2 text-rose-400 text-lg">⏮</button>
        <button onClick={undo} title="1アクション戻す" className="ml-1 text-rose-400 text-lg">↶</button>
        <div className="flex-1 text-center font-bold tracking-wider">{streetTitle(state.street)}</div>
        <button onClick={() => nav("/settings")} className="text-neutral-300 text-sm px-2">⚙</button>
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
          bb={hand.bb}
        />
      </div>

      {/* Hero cards + note row — available throughout the hand */}
      <div className="px-3 pt-2 flex gap-2">
        <button
          onClick={() => setHeroCardsOpen(true)}
          className="flex-1 py-2 bg-neutral-800 rounded text-sm"
        >
          Hero:{" "}
          <span className="font-mono">
            {hand.heroCards ? hand.heroCards.join(" ") : "未入力"}
          </span>
        </button>
        <button
          onClick={() => setNoteOpen(true)}
          className={`flex-1 py-2 rounded text-sm ${hand.note ? "bg-blue-900/50 border border-blue-700" : "bg-neutral-800"}`}
        >
          ✎ メモ{hand.note ? " ●" : ""}
        </button>
        <button
          onClick={() => setEventOpen(true)}
          className={`flex-1 py-2 rounded text-sm ${(handEvents?.length ?? 0) > 0 ? "bg-purple-900/50 border border-purple-700" : "bg-neutral-800"}`}
        >
          ⚑ Event
          {(handEvents?.length ?? 0) > 0 ? ` ${handEvents!.length}` : ""}
        </button>
      </div>

      <div className="flex-1 p-3 space-y-2">
        {showResult ? (
          <div className="space-y-3">
            <div className="bg-neutral-900 border border-neutral-800 rounded p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold">結果</div>
                <div className="text-sm text-neutral-300">Pot {fmtChips(state.pot)}</div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showdown}
                  onChange={(e) => setShowdown(e.target.checked)}
                />
                ショーダウンに行った
              </label>

              {state.sidePots.length > 1 && (
                <div className="bg-neutral-950/50 border border-neutral-800 rounded p-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-amber-300">
                      サイドポット ({state.sidePots.length}層)
                    </div>
                    <button
                      onClick={clearShares}
                      className="text-[10px] text-neutral-400 underline"
                    >
                      クリア
                    </button>
                  </div>
                  {state.sidePots.map((sp, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="text-[11px] text-neutral-300">
                        {idx === 0 ? "Main" : `Side ${idx}`}: ${sp.amount}{" "}
                        <span className="text-neutral-500">
                          ({sp.eligible.map((s) => `S${s}`).join(", ")})
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {sp.eligible.map((seat) => {
                          const snap = hand.seats.find((x) => x.seat === seat);
                          return (
                            <button
                              key={seat}
                              onClick={() => assignSidePot(sp.amount, seat)}
                              className="px-2 py-1 bg-neutral-800 rounded text-[10px]"
                            >
                              → S{seat} {snap?.name?.slice(0, 8) ?? ""}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <div className="text-[10px] text-neutral-500">
                    タップで勝者に加算（割れた場合は手で分割）
                  </div>
                </div>
              )}

              <div className="text-xs text-neutral-400">勝者とポット配分</div>
              <ul className="space-y-1">
                {survivors.map((s) => {
                  const snap = hand.seats.find((x) => x.seat === s);
                  return (
                    <li key={s} className="flex gap-2 items-center">
                      <div className="w-24 text-sm truncate">
                        S{s} {snap?.name ?? ""}
                      </div>
                      <input
                        type="number"
                        inputMode="decimal"
                        onFocus={(e) => e.currentTarget.select()}
                        value={shares[s] ?? ""}
                        onChange={(e) => setShare(s, e.target.value)}
                        placeholder="0"
                        className="flex-1"
                      />
                      <button
                        onClick={() => assignAllTo(s)}
                        className="px-2 py-2 bg-neutral-800 rounded text-xs whitespace-nowrap"
                      >
                        全部
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="flex items-center justify-between">
                <button
                  onClick={splitEvenly}
                  className="text-xs px-2 py-1 bg-neutral-800 rounded"
                >
                  均等分配
                </button>
                <div
                  className={`text-xs ${sharesRemainder === 0 ? "text-neutral-500" : "text-amber-400"}`}
                >
                  配分残: {sharesRemainder}
                </div>
              </div>

              {showdown && (
                <div className="pt-2 border-t border-neutral-800">
                  <div className="text-xs font-semibold text-neutral-200 mb-1">
                    各プレイヤーの公開カード
                  </div>
                  <div className="text-[10px] text-neutral-500 mb-2">
                    ショウダウンで見えたカードをタップで入力（覚えていないところは空欄でOK）
                  </div>
                  <div className="space-y-2">
                    {survivors
                      .filter((s) => s !== heroSeat)
                      .map((s) => {
                        const snap = hand.seats.find((x) => x.seat === s);
                        const kc = knownCards[s];
                        const pos = positions.get(s) ?? "";
                        return (
                          <button
                            key={s}
                            onClick={() => setKnownCardsSeat(s)}
                            className={`w-full flex items-center gap-3 rounded p-2 border ${
                              kc
                                ? "bg-neutral-900 border-emerald-700"
                                : "bg-neutral-950/40 border-neutral-800"
                            }`}
                          >
                            <div className="flex gap-0.5">
                              <PlayingCard
                                card={kc?.[0] ?? null}
                                size="sm"
                                faceDown={!kc}
                              />
                              <PlayingCard
                                card={kc?.[1] ?? null}
                                size="sm"
                                faceDown={!kc}
                              />
                            </div>
                            <div className="flex-1 text-left">
                              <div className="text-sm font-semibold">
                                S{s}{" "}
                                <span className="text-neutral-300 font-normal">
                                  {snap?.name ?? ""}
                                </span>
                                {pos && (
                                  <span className="text-[10px] text-neutral-500 ml-2">
                                    {pos}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-neutral-400">
                                {kc ? "カードを編集" : "タップで入力"}
                              </div>
                            </div>
                            {kc && (
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setKnownCards((prev) => {
                                    const next = { ...prev };
                                    delete next[s];
                                    return next;
                                  });
                                }}
                                className="text-rose-400 text-xs px-2"
                                role="button"
                              >
                                ✕
                              </div>
                            )}
                          </button>
                        );
                      })}
                    {survivors.filter((s) => s !== heroSeat).length === 0 && (
                      <div className="text-xs text-neutral-500 text-center py-2">
                        Hero 以外のショウダウン参加者がいません
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={nextHand}
              className="w-full py-4 bg-emerald-600 rounded font-bold text-lg"
            >
              Next Hand ▶
            </button>
          </div>
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
                ) : (
                  state.toCall === 0 && (
                    <button
                      onClick={checkThru}
                      className="px-4 py-2 bg-amber-600 rounded text-sm font-bold"
                    >
                      Check Thru
                    </button>
                  )
                )}
              </div>
            </div>

            {canCall && (
              <button onClick={onCall} className="w-full py-4 bg-blue-500 rounded font-bold text-lg">
                Call {fmtChips(state.toCall)}
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
            {boardRequirement && (
              <button
                onClick={() => setBoardSheetSlot(boardRequirement.startSlot)}
                className="w-full text-xs text-amber-300 underline pt-2"
              >
                ボードカード入力（{boardRequirement.slots.length}枚）
              </button>
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

      {pending && (
        <BetSizeSheet
          kind={pending === "BET" ? "bet" : pending === "RAISE" ? "raise" : "allin"}
          presets={presetsForPending()}
          ctx={presetCtx}
          min={pending === "ALL_IN" ? 1 : minForPending()}
          initial={pending === "ALL_IN" ? allInDraft : undefined}
          onCancel={() => setPending(null)}
          onSubmit={submitAmount}
        />
      )}

      {heroCardsOpen && (
        <CardPickerSheet
          title="Hero"
          count={2}
          initial={hand.heroCards ?? [null, null]}
          exclude={[
            ...board.filter((c): c is string => !!c),
            ...Object.values(knownCards).flat(),
          ]}
          onSubmit={saveHeroCards}
          onCancel={() => setHeroCardsOpen(false)}
        />
      )}

      {knownCardsSeat !== null && (
        <CardPickerSheet
          title={`S${knownCardsSeat} ショウダウン`}
          count={2}
          initial={knownCards[knownCardsSeat] ?? [null, null]}
          exclude={[
            ...board.filter((c): c is string => !!c),
            ...(hand.heroCards ?? []),
            ...Object.entries(knownCards)
              .filter(([s]) => Number(s) !== knownCardsSeat)
              .flatMap(([, cards]) => cards),
          ]}
          onSubmit={(cards) => saveKnownCards(knownCardsSeat, cards)}
          onCancel={() => setKnownCardsSeat(null)}
        />
      )}

      {noteOpen && (
        <NoteSheet
          initial={hand.note}
          onCancel={() => setNoteOpen(false)}
          onSave={saveNote}
        />
      )}

      {eventOpen && handId && (
        <EventSheet
          seats={hand.seats.map((s) => ({ seat: s.seat, name: s.name }))}
          defaultStreet={state.street}
          onCancel={() => setEventOpen(false)}
          onSave={async (e) => {
            await Events.create({
              handId,
              street: e.street,
              type: e.type,
              seat: e.seat,
              cards: e.cards,
              note: e.note,
              resolution: e.resolution,
            });
            setEventOpen(false);
          }}
        />
      )}
    </div>
  );
}
