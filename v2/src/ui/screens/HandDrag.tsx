import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../data/db";
import { Actions, Events, Hands, Players, Sessions, Settings } from "../../data/repo";
import { makeSetup, nextActive, resolveDealtSeats } from "../../engine/setup";
import { computeState, moveToAction } from "../../engine/reducer";
import type { Move } from "../../engine/reducer";
import type { Action as EngineAction, HandState, Street } from "../../engine/types";
import type { Action as StoredAction, SessionPlayer } from "../../data/types";
import PokerTable from "../components/PokerTable";
import type { SeatVM } from "../components/PokerTable";
import PlayingCard from "../components/PlayingCard";
import DragInput from "../components/DragInput";
import BoardCardSheet from "../components/BoardCardSheet";
import BetSizeSheet from "../components/BetSizeSheet";
import CardPickerSheet from "../components/CardPickerSheet";
import NoteSheet from "../components/NoteSheet";
import EventSheet from "../components/EventSheet";
import { PlayerEditSheet } from "../components/SetupSheets";
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
                .filter((r) => r.deletedAt === 0)
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

export default function HandDrag() {
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
  // Live session roster — lets the table show empty chairs (＋) and players who
  // sit down mid-hand, even though the engine only knows the hand snapshot.
  const roster = useLiveQuery(
    () => (sessionId ? Players.forSession(sessionId) : []),
    [sessionId]
  );
  const { hand, setup, state } = useEngineState(handId);

  const [pending, setPending] = useState<null | "BET" | "RAISE" | "ALL_IN">(null);
  // Drag layout commits all-in straight from the gesture, so we don't pre-fill
  // a draft for the bet sheet. Keeping the value at 0 lets us still render the
  // sheet for bet/raise prefills without an extra branch.
  const [allInDraft] = useState<number>(0);
  const [boardSheetSlot, setBoardSheetSlot] = useState<number | null>(null);
  const [heroCardsOpen, setHeroCardsOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [knownCardsSeat, setKnownCardsSeat] = useState<number | null>(null);
  // Seat number whose "seat a new player" sheet is open (empty/waiting chair).
  const [seatingSeat, setSeatingSeat] = useState<number | null>(null);

  // Serializes all action writes. Two rapid taps must not (a) collide on the
  // `order` key or (b) compute their move against a stale, pre-first-tap state.
  // Every mutation runs inside this chain, reads the authoritative action list
  // straight from the DB, recomputes engine state, and appends atomically.
  const writeLock = useRef<Promise<unknown>>(Promise.resolve());

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

  // seed the result-entry panel once the hand reaches result (reset if undone).
  // Seed from the persisted result whenever it has content — not only when the
  // hand is finalized — so villain cards / shares typed before finalizing
  // survive a reload or backgrounding (they are autosaved below).
  useEffect(() => {
    if (!hand || !state) return;
    if (!showResult) {
      resultSeededRef.current = false;
      return;
    }
    if (resultSeededRef.current) return;
    resultSeededRef.current = true;
    const survivors = state.inHand;
    const r = hand.result;
    const hasDraft = r.winners.length > 0 || r.knownCards.length > 0;
    if (hasDraft) {
      const m: Record<number, string> = {};
      for (const w of r.winners) m[w.seat] = String(w.amount);
      setShares(m);
      setShowdown(r.wentToShowdown);
      const kc: Record<number, [string, string]> = {};
      for (const k of r.knownCards) kc[k.seat] = k.cards;
      setKnownCards(kc);
    } else {
      setShares(survivors.length === 1 ? { [survivors[0]]: String(state.pot) } : {});
      setShowdown(survivors.length > 1);
      setKnownCards({});
    }
  }, [hand, state, showResult]);

  // Autosave the in-progress result (shares / showdown / known cards) onto the
  // hand so nothing is lost if the app reloads before the user taps Next Hand.
  // Guarded by a content compare so the write can't loop against its own
  // liveQuery update.
  useEffect(() => {
    if (!hand || !showResult || hand.finalized) return;
    if (!resultSeededRef.current) return;
    const winners = Object.entries(shares)
      .map(([seat, v]) => ({ seat: Number(seat), amount: parseFloat(v) || 0 }))
      .filter((w) => w.amount > 0);
    const knownArr = Object.entries(knownCards).map(([seat, cards]) => ({
      seat: Number(seat),
      cards,
    }));
    const next = { winners, wentToShowdown: showdown, knownCards: knownArr };
    if (JSON.stringify(next) === JSON.stringify(hand.result)) return;
    void Hands.update(hand.id, { result: next });
  }, [shares, showdown, knownCards, showResult, hand]);

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

  // Render EVERY chair 1..seatCount, not just the ones in this hand:
  //  - in the hand snapshot → a normal, playable seat
  //  - a session player who isn't in this hand (sat down mid-hand) → 待機
  //  - nobody → an empty chair with a ＋ to seat a new player
  const rosterBySeat = new Map((roster ?? []).map((p) => [p.seat, p]));
  const blankVM = (seat: number): SeatVM => ({
    seat,
    position: "",
    name: "",
    stack: null,
    isHero: false,
    isBTN: false,
    isCurrent: false,
    isFolded: false,
    isAllIn: false,
    cards: null,
    liveBet: 0,
  });
  const seatVMs: SeatVM[] = [];
  for (let seat = 1; seat <= session.seatCount; seat++) {
    const snap = hand.seats.find((s) => s.seat === seat);
    if (snap) {
      seatVMs.push({
        seat,
        position: positions.get(seat) ?? "",
        name: snap.name,
        stack: snap.startStack - (state.spentTotal[seat] ?? 0),
        isHero: seat === heroSeat,
        isBTN: seat === hand.buttonSeat,
        isCurrent: seat === state.currentSeat,
        isFolded: foldedSet.has(seat),
        isAllIn: allInSet.has(seat),
        cards:
          seat === heroSeat && hand.heroCards
            ? hand.heroCards
            : knownCards[seat] ?? null,
        liveBet: state.liveThisStreet[seat] ?? 0,
        blind: state.street === "PF" ? forcedKindBySeat.get(seat) ?? null : null,
        ante: state.street === "PF" ? anteBySeat.get(seat) ?? 0 : 0,
      });
      continue;
    }
    const rp = rosterBySeat.get(seat);
    if (rp && rp.name.trim() !== "" && !rp.isAway) {
      seatVMs.push({
        ...blankVM(seat),
        name: rp.name,
        stack: rp.stack,
        waiting: true,
        waitingForBB: rp.waitingForBB ?? false,
      });
    } else {
      seatVMs.push({ ...blankVM(seat), empty: true });
    }
  }

  // ----- mutations ----------------------------------------------------------

  // Queue `fn` after any in-flight write so writes never overlap. The chain
  // swallows errors so one rejection doesn't wedge every later write.
  function withLock<T>(fn: () => Promise<T>): Promise<T | undefined> {
    const run = writeLock.current.then(
      () => fn(),
      () => fn()
    );
    writeLock.current = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  /** Read the authoritative action log straight from the DB (not the stale
   *  liveQuery snapshot) and adapt it to engine actions. */
  async function freshEngineActions(): Promise<EngineAction[]> {
    if (!handId) return [];
    const rows = await Actions.forHand(handId);
    return rows.map((a) => ({
      street: a.street,
      seat: a.seat,
      type: a.type,
      amount: a.amount,
    }));
  }

  /** The largest TOTAL this-street commitment `seat` can afford — used to cap
   *  bet/raise amounts so a fat-finger can't record more chips than the seat
   *  physically has (it just becomes an all-in for the real stack). */
  function maxTotalFor(st: HandState, seat: number): number {
    const snap = hand?.seats.find((s) => s.seat === seat);
    if (!snap) return Infinity;
    const spent = st.spentTotal[seat] ?? 0;
    const live = st.liveThisStreet[seat] ?? 0;
    return live + Math.max(0, snap.startStack - spent);
  }

  /** Resolve `intent` against the freshest engine state, then append the
   *  resulting action atomically. `resolve` returns null to abort. */
  function commit(resolve: (st: HandState) => Move | null) {
    if (!setup || !handId) return;
    return withLock(async () => {
      const ea = await freshEngineActions();
      const st = computeState(setup, ea);
      const move = resolve(st);
      if (!move) return;
      const a = moveToAction(setup, ea, move);
      await Actions.append({
        handId,
        street: a.street,
        seat: a.seat,
        type: a.type,
        amount: a.amount,
        isAllIn: a.type === "allin",
      });
    });
  }

  const onTapSeat = (seat: number) =>
    withLock(async () => {
      if (!setup || !handId) return;
      // Defensive: refuse to advance to a seat that the engine never sees (e.g.
      // a freshly emptied chair that's no longer in the hand snapshot). Without
      // this guard, the loop below would fold every remaining seat in pursuit
      // of an unreachable target — which is what produced the
      // "Unknown プレイヤーをタップしたらハンドが終了した" report.
      if (!activeSeats.includes(seat)) return;

      const ea0 = await freshEngineActions();
      const st0 = computeState(setup, ea0);
      if (st0.currentSeat === null || st0.currentSeat === seat) return;
      if (st0.folded.includes(seat) || st0.allIn.includes(seat)) return;

      // Generate fold/check moves until the action reaches `seat`.
      const moves: Move[] = [];
      let work = [...ea0];
      let safety = setup.seatCount + 1;
      while (safety-- > 0) {
        const v = computeState(setup, work);
        if (v.currentSeat === null || v.currentSeat === seat) break;
        const move: Move =
          v.toCall > 0
            ? { seat: v.currentSeat, type: "fold" }
            : { seat: v.currentSeat, type: "check" };
        moves.push(move);
        work = [...work, moveToAction(setup, work, move)];
      }
      if (moves.length === 0) return;

      // Look at the resulting engine state. If the auto-fold cascade ends the
      // hand or never actually reaches the tapped seat, ask the user before
      // committing — otherwise a single mis-tap silently terminates the hand.
      const projected = computeState(setup, work);
      const foldCount = moves.filter((m) => m.type === "fold").length;
      const wouldEndHand = projected.inHand.length <= 1 || projected.handComplete;
      const targetReached = projected.currentSeat === seat;
      if (wouldEndHand) {
        if (
          !confirm(
            `このタップで ${foldCount} 人が fold してハンドが終了します。続行しますか？`
          )
        )
          return;
      } else if (foldCount > 0) {
        const detail = !targetReached ? "（タップした席までは届きません）" : "";
        if (!confirm(`${foldCount} 人が fold します${detail}。続行しますか？`))
          return;
      }

      const rows: Omit<
        StoredAction,
        "id" | "updatedAt" | "deletedAt" | "order" | "handId"
      >[] = [];
      let progress = [...ea0];
      for (const m of moves) {
        const a = moveToAction(setup, progress, m);
        rows.push({
          street: a.street,
          seat: a.seat,
          type: a.type,
          amount: a.amount,
          isAllIn: false,
        });
        progress = [...progress, a];
      }
      await Actions.appendMany(handId, rows);
    });

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

  // Each acts on whoever is to act in the FRESH engine state, so a queued tap
  // (fired before the previous one's liveQuery round-trip) targets the right
  // seat instead of re-acting for the seat that already acted.
  const onFold = () =>
    commit((st) =>
      st.currentSeat !== null ? { seat: st.currentSeat, type: "fold" } : null
    );
  const onCheck = () =>
    commit((st) =>
      st.currentSeat !== null && st.toCall === 0
        ? { seat: st.currentSeat, type: "check" }
        : null
    );
  const onCall = () =>
    commit((st) =>
      st.currentSeat !== null ? { seat: st.currentSeat, type: "call" } : null
    );

  const openBet = () => setPending("BET");
  const openRaise = () => setPending("RAISE");
  /** Commit an all-in immediately, no sheet. Used by the drag overlay when
   *  the user pulls past the all-in threshold — the gesture is intentional
   *  enough that a confirm-shove sheet just adds friction. */
  const openAllInDirect = () =>
    commit((st) =>
      st.currentSeat !== null ? { seat: st.currentSeat, type: "allin" } : null
    );

  const submitAmount = async (amt: number) => {
    const kind = pending;
    setPending(null);
    if (kind === "BET" || kind === "RAISE") {
      const type = kind === "BET" ? "bet" : "raise";
      await commit((st) => {
        if (st.currentSeat === null) return null;
        // Cap the target to the seat's stack: a typo'd over-bet can't record
        // more chips than the seat has — it collapses to an all-in instead.
        const to = Math.min(amt, maxTotalFor(st, st.currentSeat));
        return { seat: st.currentSeat, type, to };
      });
    } else if (kind === "ALL_IN") {
      // honor the user's amount (lets them correct an outdated snapshot stack)
      // but never less than 0; resolved against the freshest state.
      await withLock(async () => {
        if (!setup || !handId) return;
        const ea = await freshEngineActions();
        const st = computeState(setup, ea);
        if (st.currentSeat === null) return;
        await Actions.append({
          handId,
          street: st.street,
          seat: st.currentSeat,
          type: "allin",
          amount: Math.max(0, amt),
          isAllIn: true,
        });
      });
    }
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

  const undo = () =>
    withLock(async () => {
      if (handId) await Actions.popLast(handId);
    });

  /** Undo every action on the current street + clear the board cards that
   *  street introduced. Handy when the user goes "no wait, that whole flop
   *  was different" and wants a single tap to back out the street. */
  const undoStreet = () =>
    withLock(async () => {
      if (!handId || !setup) return;
      const rows = await Actions.forHand(handId);
      const cur = computeState(
        setup,
        rows.map((a) => ({
          street: a.street,
          seat: a.seat,
          type: a.type,
          amount: a.amount,
        }))
      ).street;
      const ofStreet = rows.filter((a) => a.street === cur);
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
    });

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
  /** Split each SIDE POT evenly among that pot's eligible survivors. With no
   *  side pots (or a single-tier main pot) this collapses to the obvious
   *  "split the whole pot" behaviour, but when a short stack is all-in it
   *  correctly excludes them from side pots they can't win. */
  const splitEvenly = () => {
    if (survivors.length === 0) return;
    const survSet = new Set(survivors);
    const m: Record<number, number> = {};
    for (const s of survivors) m[s] = 0;
    const pots = state.sidePots.length > 0
      ? state.sidePots
      : [{ amount: state.pot, eligible: survivors }];
    for (const pot of pots) {
      const winners = pot.eligible.filter((s) => survSet.has(s));
      if (winners.length === 0) continue;
      const each = Math.floor(pot.amount / winners.length);
      const rem = pot.amount - each * winners.length;
      winners.forEach((s, i) => {
        m[s] += each + (i === 0 ? rem : 0);
      });
    }
    const out: Record<number, string> = {};
    for (const s of Object.keys(m).map(Number)) out[s] = String(m[s]);
    setShares(out);
  };

  const foldAll = () =>
    withLock(async () => {
      if (!setup || !handId) return;
      const st = computeState(setup, await freshEngineActions());
      // Fold every seat that still OWES chips on this street (live < currentBet).
      // Seats that already matched the current bet — callers, the bettor /
      // raiser, BB option in a limped pot, anyone who said "call" — stay in the
      // hand. So a bet+call followed by Fold All correctly leaves the bettor
      // and caller to see the next street. Already all-in seats stay in too.
      const allInNow = new Set(st.allIn);
      const toFold = st.inHand.filter((s) => {
        if (allInNow.has(s)) return false;
        return (st.liveThisStreet[s] ?? 0) < st.currentBet;
      });
      if (toFold.length === 0) return;
      await Actions.appendMany(
        handId,
        toFold.map((s) => ({
          street: st.street,
          seat: s,
          type: "fold" as const,
          amount: 0,
          isAllIn: false,
        }))
      );
    });

  // Postflop "Check Thru" — emit a CHECK action for every remaining seat
  // until the street closes. Used by the user when nobody bet (or after a
  // bet that everyone called) to fast-forward straight to the next street.
  // Stops if anyone faces a non-zero toCall (i.e. nothing-to-check).
  /** Check the rest of the way around THIS street only — don't bleed into
   *  the next street even if the engine would advance. */
  const checkThru = () =>
    withLock(async () => {
      if (!setup || !handId) return;
      const work0 = await freshEngineActions();
      const startStreet = computeState(setup, work0).street;
      let work = [...work0];
      const newRows: Omit<
        StoredAction,
        "id" | "updatedAt" | "deletedAt" | "order" | "handId"
      >[] = [];
      let safety = setup.seatCount + 1;
      while (safety-- > 0) {
        const st = computeState(setup, work);
        if (st.currentSeat === null) break;
        if (st.street !== startStreet) break; // don't carry into the next street
        if (st.toCall > 0) break; // someone has to call — abort
        const ea = moveToAction(setup, work, { seat: st.currentSeat, type: "check" });
        newRows.push({
          street: ea.street,
          seat: ea.seat,
          type: ea.type,
          amount: ea.amount,
          isAllIn: false,
        });
        work = [...work, ea];
      }
      if (newRows.length > 0) await Actions.appendMany(handId, newRows);
    });

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
    const winTotal = winners.reduce((s, w) => s + w.amount, 0);
    // Never persist a hand whose recorded pay-outs don't match the pot — that
    // miscount silently corrupts every downstream stack delta. Warn-confirm
    // instead of failing silently so the user can still proceed (e.g. when
    // they intentionally don't know who won a side pot).
    if (winTotal !== state.pot) {
      const diff = state.pot - winTotal;
      const sign = diff > 0 ? "+" : "";
      if (
        !confirm(
          `配分の合計がポットと一致しません（差: ${sign}${diff}）。このまま次のハンドへ進みますか？`
        )
      )
        return;
    }
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

    // create next hand snapshot — honour mid-session joiners: players posting
    // are dealt in with a post chip; players who chose "wait for BB" are held
    // out until the BB reaches their seat (resolveDealtSeats), then join.
    const prev = await Hands.lastForSession(session.id);
    const handNo = (prev?.handNo ?? hand.handNo) + 1;
    const updatedRoster = await Players.forSession(session.id);
    const { dealt, joining } = resolveDealtSeats(
      updatedRoster,
      next,
      session.seatCount
    );
    const seatsSnap = updatedRoster
      .filter((p) => dealt.includes(p.seat))
      .map((p) => ({
        seat: p.seat,
        name: p.name,
        startStack: p.stack ?? 0,
        posted: p.mustPostBB
          ? [
              { kind: "post" as const, amount: hand.bb },
              ...(p.postWithAnte && hand.ante > 0
                ? [{ kind: "post_ante" as const, amount: hand.ante }]
                : []),
            ]
          : [],
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
    // Clear one-time flags now that the snapshot is taken: posts are consumed,
    // and anyone who just joined off the BB-wait is now a regular player.
    for (const p of updatedRoster) {
      const patch: Partial<SessionPlayer> = {};
      if (p.mustPostBB || p.postWithAnte) {
        patch.mustPostBB = false;
        patch.postWithAnte = false;
      }
      if (p.waitingForBB && joining.includes(p.seat)) patch.waitingForBB = false;
      if (Object.keys(patch).length > 0) await Players.update(p.id, patch);
    }
    nav(`/sessions/${session.id}/hands/${nh.id}`);
  };

  // ----- render -------------------------------------------------------------

  // Drag layout exposes legality straight to the DragInput component — the
  // action buttons that used these flags in the classic layout are gone.

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top row — dedicated to the Session Setup back link so it's hard to
          confuse with the undo buttons below. */}
      <div className="flex items-center px-3 py-1.5 border-b border-neutral-900">
        <button
          onClick={() => nav(`/sessions/${session.id}/setup`)}
          className="text-emerald-400 text-sm font-semibold"
        >
          ‹ Session Setup
        </button>
        <button
          onClick={() => nav(`/sessions/${session.id}/hands/${hand.id}`)}
          className="ml-auto text-[11px] text-neutral-400 px-2 py-0.5 rounded bg-neutral-800"
          title="ボタン式の元レイアウトに戻る"
        >
          Classic
        </button>
        <div className="ml-2 text-xs text-neutral-500">
          Hand #{hand.handNo}
        </div>
      </div>
      {/* Action row — street label + settings. Undo buttons moved down to the
          Fold-All row to match the classic layout. */}
      <div className="flex items-center px-3 py-2 border-b border-neutral-800">
        <div className="flex-1 text-center font-bold tracking-wider">
          {streetTitle(state.street)}
        </div>
        <button
          onClick={() => nav("/settings")}
          className="text-neutral-300 text-sm px-2"
        >
          ⚙
        </button>
      </div>

      <div className="relative">
        <PokerTable
          totalSeats={session.seatCount}
          seats={seatVMs}
          pot={state.pot}
          streetLabel={streetTitle(state.street)}
          board={board}
          onTapSeat={onTapSeat}
          onTapEmptySeat={(seat) => setSeatingSeat(seat)}
          onTapBoardSlot={onTapBoardSlot}
          bb={hand.bb}
          portrait
          heroSeat={heroSeat}
          aspectRatio="3/5"
          maxHeightClass="max-h-[68vh]"
        />
        {/* Drag input overlay — anchored to the current actor's seat. Reads
            the same seat coordinates as PokerTable so it's always exactly on
            top of the avatar. Hidden when the action panel takes over. */}
        {!showResult && state.currentSeat !== null && (
          <DragInput
            seat={state.currentSeat}
            totalSeats={session.seatCount}
            heroSeat={heroSeat}
            canCheck={state.toCall === 0}
            canCall={state.toCall > 0}
            canBet={state.currentBet === 0}
            canRaise={
              state.currentBet > 0 &&
              state.canRaise &&
              state.toCall < maxTotalFor(state, state.currentSeat) -
                (state.liveThisStreet[state.currentSeat] ?? 0)
            }
            toCallAmount={state.toCall}
            onFold={onFold}
            onCheck={onCheck}
            onCall={onCall}
            onBet={openBet}
            onRaise={openRaise}
            onAllIn={openAllInDirect}
          />
        )}
      </div>

      {/* Hero cards + note row — available throughout the hand */}
      <div className="px-2 pt-1.5 flex gap-2">
        <button
          onClick={() => setHeroCardsOpen(true)}
          className="flex-1 py-1.5 bg-neutral-800 rounded text-sm"
        >
          Hero:{" "}
          <span className="font-mono">
            {hand.heroCards ? hand.heroCards.join(" ") : "未入力"}
          </span>
        </button>
        <button
          onClick={() => setNoteOpen(true)}
          className={`flex-1 py-1.5 rounded text-sm ${hand.note ? "bg-blue-900/50 border border-blue-700" : "bg-neutral-800"}`}
        >
          ✎ メモ{hand.note ? " ●" : ""}
        </button>
        <button
          onClick={() => setEventOpen(true)}
          className={`flex-1 py-1.5 rounded text-sm ${(handEvents?.length ?? 0) > 0 ? "bg-purple-900/50 border border-purple-700" : "bg-neutral-800"}`}
        >
          ⚑ Event
          {(handEvents?.length ?? 0) > 0 ? ` ${handEvents!.length}` : ""}
        </button>
      </div>

      <div className="flex-1 p-2 space-y-1.5">
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
                    {survivors.map((s) => {
                      const isHero = s === heroSeat;
                      const snap = hand.seats.find((x) => x.seat === s);
                      // Hero's cards live on hand.heroCards (input/edited via
                      // the Hero card sheet). Everyone else uses knownCards.
                      const cards: [string, string] | null = isHero
                        ? hand.heroCards
                        : knownCards[s] ?? null;
                      const pos = positions.get(s) ?? "";
                      const onTap = () =>
                        isHero ? setHeroCardsOpen(true) : setKnownCardsSeat(s);
                      const onClear = () => {
                        if (isHero) {
                          void Hands.update(hand.id, { heroCards: null });
                        } else {
                          setKnownCards((prev) => {
                            const next = { ...prev };
                            delete next[s];
                            return next;
                          });
                        }
                      };
                      return (
                        <button
                          key={s}
                          onClick={onTap}
                          className={`w-full flex items-center gap-3 rounded p-2 border ${
                            cards
                              ? isHero
                                ? "bg-neutral-900 border-yellow-700"
                                : "bg-neutral-900 border-emerald-700"
                              : "bg-neutral-950/40 border-neutral-800"
                          }`}
                        >
                          <div className="flex gap-0.5">
                            <PlayingCard
                              card={cards?.[0] ?? null}
                              size="sm"
                              faceDown={!cards}
                            />
                            <PlayingCard
                              card={cards?.[1] ?? null}
                              size="sm"
                              faceDown={!cards}
                            />
                          </div>
                          <div className="flex-1 text-left">
                            <div className="text-sm font-semibold">
                              {isHero && (
                                <span className="text-yellow-300">★ </span>
                              )}
                              S{s}{" "}
                              <span className="text-neutral-300 font-normal">
                                {isHero ? "Hero" : snap?.name ?? ""}
                              </span>
                              {pos && (
                                <span className="text-[10px] text-neutral-500 ml-2">
                                  {pos}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-neutral-400">
                              {cards ? "カードを編集" : "タップで入力"}
                            </div>
                          </div>
                          {cards && (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                onClear();
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
                    {survivors.length === 0 && (
                      <div className="text-xs text-neutral-500 text-center py-2">
                        ショウダウン参加者がいません
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
            {/* In drag mode the action input lives on the table itself (a
                radial that appears under the thumb when you press the current
                actor). Down here we only keep the street-wide shortcuts
                (Fold All / Check Thru) and the board-entry nudge. */}
            <div className="text-center text-[11px] text-neutral-500 -mt-1">
              アバターを上下左右にドラッグ：↑ Bet/Raise（長めで All-in） ／ ↓ Fold ／ ← Check ／ → Call
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={undo}
                className="px-3 py-2 bg-neutral-800 rounded text-xs text-neutral-200"
              >
                1手戻す
              </button>
              <button
                onClick={undoStreet}
                className="px-3 py-2 bg-neutral-800 rounded text-xs text-neutral-200"
              >
                ストリート戻す
              </button>
              {state.street === "PF" && (
                <button
                  onClick={foldAll}
                  className="ml-auto px-4 py-2 bg-rose-500 rounded text-sm font-bold"
                >
                  Fold All
                </button>
              )}
              {state.street !== "PF" &&
                state.toCall === 0 &&
                state.currentSeat !== null && (
                  <button
                    onClick={checkThru}
                    className="ml-auto px-4 py-2 bg-amber-600 rounded text-sm font-bold"
                  >
                    Check Thru
                  </button>
                )}
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
          max={
            pending !== "ALL_IN" && state.currentSeat !== null
              ? maxTotalFor(state, state.currentSeat)
              : undefined
          }
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

      {seatingSeat !== null && (() => {
        // Seat a new player mid-session into an empty/waiting chair. This edits
        // the SESSION roster only — the current hand keeps its snapshot, so the
        // new player joins from the NEXT hand. Reuses the Setup player sheet.
        const existing = (roster ?? []).find((p) => p.seat === seatingSeat);
        const placeholder = {
          id: "",
          sessionId: session.id,
          seat: seatingSeat,
          name: "",
          isHero: false,
          isAway: false,
          mustPostBB: false,
          postWithAnte: false,
          stack: null as number | null,
          note: "",
          updatedAt: 0,
          deletedAt: 0,
        };
        return (
          <PlayerEditSheet
            seat={seatingSeat}
            player={existing ?? placeholder}
            bb={hand.bb}
            ante={hand.ante}
            suggestions={[]}
            seatingMode
            onClose={() => setSeatingSeat(null)}
            onSave={async (patch) => {
              if (existing) {
                await Players.update(existing.id, patch);
              } else {
                await Players.create({
                  sessionId: session.id,
                  seat: seatingSeat,
                  name: patch.name ?? "",
                  isHero: false,
                  isAway: patch.isAway ?? false,
                  mustPostBB: patch.mustPostBB ?? false,
                  postWithAnte: patch.postWithAnte ?? false,
                  waitingForBB: patch.waitingForBB ?? false,
                  stack: patch.stack ?? null,
                  note: "",
                });
              }
              setSeatingSeat(null);
            }}
            onSitOut={async () => {
              if (existing) await Players.update(existing.id, { isAway: !existing.isAway });
              setSeatingSeat(null);
            }}
          />
        );
      })()}

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
