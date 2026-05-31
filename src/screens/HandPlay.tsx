import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useParams } from "react-router-dom";
import { db, DEFAULT_BET_SETTINGS, getBetSettings } from "../db/db";
import type { Action, ActionType, BetPreset, BetSettings, Street } from "../db/types";
import PokerTable from "../components/PokerTable";
import type { SeatRenderInfo } from "../components/PokerTable";
import BoardCardSheet from "../components/BoardCardSheet";
import { getPositionLabels } from "../utils/positions";
import { bbSeat, computeStreetState, handIsOver, nextSeat, sbSeat } from "../utils/poker";
import { advanceToSeat, startNextHand } from "../utils/handFlow";

export default function HandPlayScreen() {
  const { id, handId } = useParams();
  const sessionId = Number(id);
  const handDbId = Number(handId);
  const nav = useNavigate();

  const session = useLiveQuery(() => db.sessions.get(sessionId), [sessionId]);
  const hand = useLiveQuery(() => db.hands.get(handDbId), [handDbId]);
  const players = useLiveQuery(
    () =>
      db.players
        .where({ sessionId })
        .toArray()
        .then((ps) => ps.sort((a, b) => a.seat - b.seat)),
    [sessionId]
  );
  const actions = useLiveQuery(
    () =>
      db.actions
        .where({ handId: handDbId })
        .toArray()
        .then((as) => as.sort((a, b) => a.order - b.order)),
    [handDbId]
  );

  const [betSettings, setBetSettings] = useState<BetSettings>(DEFAULT_BET_SETTINGS);
  const [street, setStreet] = useState<Street>("PF");
  const [boardSheet, setBoardSheet] = useState<{ start: number } | null>(null);
  const [pending, setPending] = useState<null | "BET" | "RAISE" | "ALL_IN">(null);
  const [draftAmount, setDraftAmount] = useState<string>("");
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    getBetSettings().then(setBetSettings);
  }, []);

  useEffect(() => {
    if (!hand) return;
    if (hand.board.river) setStreet("R");
    else if (hand.board.turn) setStreet("T");
    else if (hand.board.flop) setStreet("F");
    else setStreet("PF");
  }, [hand?.board.flop, hand?.board.turn, hand?.board.river]);

  const blindsPosted = useMemo(
    () => (actions ?? []).some((a) => a.type === "BLIND_BB"),
    [actions]
  );

  useEffect(() => {
    if (!hand || !players || !session || !actions) return;
    if (blindsPosted) return;
    const seats = session.seats;
    const active = hand.activeSeats;
    const sb = sbSeat(hand.buttonSeat, seats, active);
    const bb = bbSeat(hand.buttonSeat, seats, active);
    if (sb === null || bb === null) return;
    const utg = nextSeat(bb, seats, active);

    (async () => {
      await db.transaction("rw", [db.actions, db.players], async () => {
        const existing = await db.actions
          .where({ handId: handDbId })
          .filter((a) => a.type === "BLIND_BB")
          .first();
        if (existing) return;
        let order = 0;
        for (const p of players) {
          if (p.isAway || !active.includes(p.seat)) continue;
          if (hand.ante > 0) {
            await db.actions.add({
              handId: handDbId,
              order: order++,
              street: "PF",
              seat: p.seat,
              type: "ANTE",
              amount: hand.ante,
              totalPutIn: hand.ante,
              isAllIn: false,
            });
          }
        }
        for (const p of players) {
          if (!active.includes(p.seat)) continue;
          if (p.mustPostSB) {
            await db.actions.add({
              handId: handDbId,
              order: order++,
              street: "PF",
              seat: p.seat,
              type: "POST",
              amount: hand.sb,
              totalPutIn: hand.sb,
              isAllIn: false,
            });
          }
          if (p.mustPostBB) {
            await db.actions.add({
              handId: handDbId,
              order: order++,
              street: "PF",
              seat: p.seat,
              type: "POST",
              amount: hand.bb,
              totalPutIn: hand.bb,
              isAllIn: false,
            });
          }
        }
        await db.actions.add({
          handId: handDbId,
          order: order++,
          street: "PF",
          seat: sb,
          type: "BLIND_SB",
          amount: hand.sb,
          totalPutIn: hand.sb,
          isAllIn: false,
        });
        await db.actions.add({
          handId: handDbId,
          order: order++,
          street: "PF",
          seat: bb,
          type: "BLIND_BB",
          amount: hand.bb,
          totalPutIn: hand.bb,
          isAllIn: false,
        });
        if (session.autoStraddle && utg !== null) {
          await db.actions.add({
            handId: handDbId,
            order: order++,
            street: "PF",
            seat: utg,
            type: "STRADDLE",
            amount: hand.bb * 2,
            totalPutIn: hand.bb * 2,
            isAllIn: false,
          });
        }
        for (const p of players) {
          if (!active.includes(p.seat)) continue;
          if (p.mustPostSB || p.mustPostBB) {
            if (p.id !== undefined) {
              await db.players.update(p.id, {
                mustPostSB: false,
                mustPostBB: false,
              });
            }
          }
        }
      });
    })();
  }, [hand, players, session, actions, blindsPosted, handDbId]);

  const state = useMemo(() => {
    if (!hand || !actions || !players) return null;
    return computeStreetState(hand, actions, street, players);
  }, [hand, actions, street, players]);

  if (!session || !hand || !players || !actions) return null;

  const positions = getPositionLabels(hand.activeSeats, hand.buttonSeat);
  const folded = new Set(actions.filter((a) => a.type === "FOLD").map((a) => a.seat));
  const betsThisStreet = new Map<number, number>();
  for (const a of actions.filter((a) => a.street === street)) {
    if (a.type === "FOLD" || a.type === "CHECK" || a.type === "ANTE") continue;
    betsThisStreet.set(a.seat, (betsThisStreet.get(a.seat) ?? 0) + a.amount);
  }

  const heroSeat = players.find((p) => p.isHero)?.seat ?? null;
  const heroCards = hand.heroCards ?? null;
  const knownCards = new Map<number, [string, string]>();
  if (heroCards && heroSeat !== null) knownCards.set(heroSeat, heroCards);
  for (const k of hand.knownCards ?? []) knownCards.set(k.seat, k.cards);

  const seats: SeatRenderInfo[] = players.map((p) => {
    const inHand = hand.activeSeats.includes(p.seat);
    return {
      seat: p.seat,
      position: inHand ? positions.get(p.seat) ?? "" : "",
      name: p.name,
      stack: p.stack,
      isHero: p.isHero,
      isBTN: p.seat === hand.buttonSeat,
      isCurrent: state?.currentSeat === p.seat,
      isFolded: folded.has(p.seat) || !inHand,
      isShown: inHand && knownCards.has(p.seat),
      betThisStreet: betsThisStreet.get(p.seat) ?? 0,
      cards: knownCards.get(p.seat) ?? null,
      faceDown: !knownCards.has(p.seat),
    };
  });

  const board: (string | null)[] = [
    hand.board.flop?.[0] ?? null,
    hand.board.flop?.[1] ?? null,
    hand.board.flop?.[2] ?? null,
    hand.board.turn ?? null,
    hand.board.river ?? null,
  ];
  const usedCards = board.filter((c): c is string => !!c);

  const isOver = handIsOver(hand, actions);
  const streetDone = state?.done ?? false;

  const onTapSeat = async (seat: number) => {
    if (!state || state.currentSeat === null) return;
    if (state.currentSeat === seat) return;
    if (!hand.activeSeats.includes(seat)) return;
    if (folded.has(seat)) return;
    await advanceToSeat(hand, actions, players, street, seat);
  };

  const onTapBoardSlot = (index: number) => {
    setBoardSheet({ start: index });
  };

  const submitBoard = async (slots: (string | null)[]) => {
    const flop =
      slots[0] && slots[1] && slots[2]
        ? ([slots[0], slots[1], slots[2]] as [string, string, string])
        : null;
    await db.hands.update(handDbId, {
      board: {
        flop,
        turn: slots[3] ?? null,
        river: slots[4] ?? null,
      },
    });
    setBoardSheet(null);
  };

  const clearBoard = async () => {
    await db.hands.update(handDbId, {
      board: { flop: null, turn: null, river: null },
    });
    setBoardSheet(null);
  };

  const addAction = async (type: ActionType, amount: number, allIn = false) => {
    if (!state || state.currentSeat === null) return;
    const nextOrder = (actions[actions.length - 1]?.order ?? -1) + 1;
    await db.actions.add({
      handId: handDbId,
      order: nextOrder,
      street,
      seat: state.currentSeat,
      type,
      amount,
      totalPutIn: amount,
      isAllIn: allIn,
    });
  };

  const onFold = () => addAction("FOLD", 0);
  const onCheck = () => addAction("CHECK", 0);
  const onCall = () => {
    if (!state || state.currentSeat === null) return;
    addAction("CALL", state.toCall(state.currentSeat));
  };

  const maxStraddle = actions
    .filter((a) => a.type === "STRADDLE" && a.street === "PF")
    .reduce((max, a) => Math.max(max, a.amount), 0);
  const usingStraddleUnit = street === "PF" && maxStraddle > 0;

  const computePreset = (preset: BetPreset): number => {
    let v = 0;
    switch (preset.basis) {
      case "bb":
        v = hand.bb * preset.multiplier;
        break;
      case "str":
        v = (maxStraddle || hand.bb * 2) * preset.multiplier;
        break;
      case "pot":
        v = (state?.pot ?? 0) * preset.multiplier;
        break;
      case "call":
        v = (state && state.currentSeat !== null ? state.toCall(state.currentSeat) : 0) * preset.multiplier;
        break;
    }
    return Math.round(v * 100) / 100;
  };

  const openBet = () => {
    setPending("BET");
    setDraftAmount("");
  };
  const openRaise = () => {
    setPending("RAISE");
    let openIncrement = hand.bb;
    if (street === "PF" && maxStraddle > 0) openIncrement = maxStraddle;
    const minRaise = (state?.currentBet ?? 0) + Math.max(state?.lastRaiseSize ?? 0, openIncrement);
    setDraftAmount(String(minRaise));
  };
  const openAllIn = () => {
    setPending("ALL_IN");
    setDraftAmount("");
  };

  const submitPending = async () => {
    const amount = parseFloat(draftAmount) || 0;
    if (pending === "BET") await addAction("BET", amount);
    else if (pending === "RAISE") await addAction("RAISE", amount);
    else if (pending === "ALL_IN") await addAction("ALL_IN", amount, true);
    setPending(null);
    setDraftAmount("");
  };

  const undo = async () => {
    const last = actions[actions.length - 1];
    if (!last || last.id === undefined) return;
    await db.actions.delete(last.id);
  };

  const foldAll = async () => {
    if (!state || state.currentSeat === null) return;
    let order = (actions[actions.length - 1]?.order ?? -1) + 1;
    const surviving = hand.activeSeats.filter((s) => !folded.has(s));
    const inserts: Omit<Action, "id">[] = [];
    for (const s of surviving) {
      if (s === state.currentSeat) continue;
      if (s === heroSeat) continue;
      inserts.push({
        handId: handDbId,
        order: order++,
        street,
        seat: s,
        type: "FOLD",
        amount: 0,
        totalPutIn: 0,
        isAllIn: false,
      });
    }
    if (inserts.length) await db.actions.bulkAdd(inserts);
  };

  const checkThru = async () => {
    if (!state || state.currentSeat === null) return;
    let order = (actions[actions.length - 1]?.order ?? -1) + 1;
    const inserts: Omit<Action, "id">[] = [];
    let work = [...actions];
    while (true) {
      const s2 = computeStreetState(hand, work, street, players);
      if (s2.currentSeat === null) break;
      if (s2.toCall(s2.currentSeat) > 0) break;
      const a: Omit<Action, "id"> = {
        handId: handDbId,
        order: order++,
        street,
        seat: s2.currentSeat,
        type: "CHECK",
        amount: 0,
        totalPutIn: 0,
        isAllIn: false,
      };
      inserts.push(a);
      work = [...work, { ...a, id: -inserts.length }];
    }
    if (inserts.length) await db.actions.bulkAdd(inserts);
  };

  const goNextHand = async () => {
    if (!hand.finalized) {
      const survivors = hand.activeSeats.filter((s) => !folded.has(s));
      let winners = hand.winners;
      if (winners.length === 0 && survivors.length === 1) {
        winners = [{ seat: survivors[0], amount: state?.pot ?? 0 }];
      }
      await db.hands.update(handDbId, {
        winners,
        pot: state?.pot ?? 0,
        finalized: true,
        endedAt: Date.now(),
      });
    }
    const refreshedHand = await db.hands.get(handDbId);
    const refreshedPlayers = await db.players.where({ sessionId }).toArray();
    const updates: { id: number; stack: number }[] = [];
    if (refreshedHand && refreshedPlayers) {
      const putIn = new Map<number, number>();
      for (const a of actions) {
        if (a.type === "FOLD" || a.type === "CHECK") continue;
        putIn.set(a.seat, (putIn.get(a.seat) ?? 0) + a.amount);
      }
      const wins = new Map<number, number>();
      for (const w of refreshedHand.winners) {
        wins.set(w.seat, (wins.get(w.seat) ?? 0) + w.amount);
      }
      for (const p of refreshedPlayers) {
        if (p.stack === undefined || p.id === undefined) continue;
        const delta = (wins.get(p.seat) ?? 0) - (putIn.get(p.seat) ?? 0);
        if (delta !== 0) updates.push({ id: p.id, stack: p.stack + delta });
      }
    }
    for (const u of updates) {
      await db.players.update(u.id, { stack: u.stack });
    }
    const sessionFresh = await db.sessions.get(sessionId);
    const playersFresh = await db.players.where({ sessionId }).toArray();
    if (!sessionFresh || !refreshedHand) return;
    const nextId = await startNextHand(sessionFresh, refreshedHand, playersFresh);
    nav(`/sessions/${sessionId}/hands/${nextId}/play`);
  };

  const canCheck = state && state.currentSeat !== null && state.toCall(state.currentSeat) === 0;
  const canCall = state && state.currentSeat !== null && state.toCall(state.currentSeat) > 0;
  const canBet = state && state.currentBet === 0 && !isOver && !streetDone;
  const canRaise = state && state.currentBet > 0 && !isOver && !streetDone && !canCheck;

  const streetTitle = street === "PF" ? "PREFLOP" : street === "F" ? "FLOP" : street === "T" ? "TURN" : "RIVER";

  const presetList = pending === "BET"
    ? betSettings.postflopBet
    : pending === "RAISE"
      ? street === "PF"
        ? usingStraddleUnit
          ? betSettings.pfRaiseStraddle
          : betSettings.pfRaise
        : betSettings.postflopRaise
      : [];

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center px-3 py-2 border-b border-neutral-800 bg-neutral-950">
        <button onClick={() => nav(`/sessions/${sessionId}/table`)} className="text-emerald-400 text-lg">‹</button>
        <button onClick={undo} className="ml-3 text-rose-400 text-lg">↻</button>
        <div className="flex-1 text-center font-bold tracking-wider">{streetTitle}</div>
        <button onClick={() => setShowSettings(true)} className="text-neutral-300 text-sm px-2">⚙</button>
      </div>

      <div className="px-2 pt-2">
        <PokerTable
          totalSeats={session.seats}
          seats={seats}
          pot={state?.pot ?? 0}
          street={streetTitle}
          board={board}
          onTapSeat={onTapSeat}
          onTapBoardSlot={onTapBoardSlot}
        />
      </div>

      <div className="flex-1 p-3 space-y-2">
        {(isOver || (street === "R" && streetDone)) ? (
          <button
            onClick={goNextHand}
            className="w-full py-4 bg-emerald-600 rounded font-bold text-lg"
          >
            Next Hand ▶
          </button>
        ) : (
          <>
            <div className="flex gap-2">
              <button onClick={() => nav(`/sessions/${sessionId}/table`)} className="px-4 py-2 bg-neutral-700 rounded text-sm">Back</button>
              {street === "PF" ? (
                <button onClick={foldAll} className="ml-auto px-4 py-2 bg-rose-500 rounded text-sm font-bold">Fold All</button>
              ) : (
                <button onClick={checkThru} className="ml-auto px-4 py-2 bg-amber-600 rounded text-sm font-bold">Check Thru</button>
              )}
            </div>

            {pending ? (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  {presetList.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => setDraftAmount(String(computePreset(p)))}
                      className="py-2 bg-blue-500 rounded text-sm font-bold"
                    >
                      {p.label} (${computePreset(p)})
                    </button>
                  ))}
                  <button
                    onClick={openAllIn}
                    className="py-2 bg-amber-500 rounded text-sm font-bold"
                  >
                    All-in
                  </button>
                </div>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    inputMode="decimal"
                    onFocus={(e) => e.currentTarget.select()}
                    value={draftAmount}
                    onChange={(e) => setDraftAmount(e.target.value)}
                    className="flex-1"
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
                    Call {state && state.currentSeat !== null ? state.toCall(state.currentSeat) : ""}
                  </button>
                )}
                {canCheck && (
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
                  <button onClick={onFold} className="py-4 bg-rose-500 rounded font-bold text-lg">
                    Fold
                  </button>
                  <button onClick={openAllIn} className="py-4 bg-amber-500 rounded font-bold text-lg">
                    All-in
                  </button>
                </div>
                {(streetDone && !isOver) && (
                  <button
                    onClick={() => setBoardSheet({ start: street === "PF" ? 0 : street === "F" ? 3 : 4 })}
                    className="w-full mt-2 py-3 bg-felt-700 rounded font-bold"
                  >
                    次のストリート (ボードカード) ▶
                  </button>
                )}
              </>
            )}
          </>
        )}

        {heroSeat !== null && (
          <button
            onClick={() => setBoardSheet({ start: 0 })}
            className="w-full mt-2 py-2 bg-neutral-800 rounded text-sm text-neutral-300"
          >
            Hero カード: {heroCards ? `${heroCards[0]} ${heroCards[1]}` : "未入力"}
          </button>
        )}
      </div>

      {boardSheet && (
        <BoardCardSheet
          initialBoard={board}
          startSlot={boardSheet.start}
          hero={heroCards}
          exclude={usedCards}
          onSubmit={submitBoard}
          onCancel={() => setBoardSheet(null)}
          onClear={clearBoard}
        />
      )}

      {showSettings && (
        <BetSettingsSheet
          settings={betSettings}
          onClose={() => setShowSettings(false)}
          onSave={async (s) => {
            if (s.id) {
              await db.betSettings.update(s.id, {
                pfRaise: s.pfRaise,
                pfRaiseStraddle: s.pfRaiseStraddle,
                postflopBet: s.postflopBet,
                postflopRaise: s.postflopRaise,
              });
            } else {
              const id = await db.betSettings.add(s);
              s.id = id;
            }
            setBetSettings(s);
            setShowSettings(false);
          }}
        />
      )}
    </div>
  );
}

function BetSettingsSheet({
  settings,
  onClose,
  onSave,
}: {
  settings: BetSettings;
  onClose: () => void;
  onSave: (s: BetSettings) => void;
}) {
  const [draft, setDraft] = useState<BetSettings>(JSON.parse(JSON.stringify(settings)));

  const editPreset = (
    list: keyof Omit<BetSettings, "id">,
    idx: number,
    patch: Partial<BetPreset>
  ) => {
    const next = { ...draft };
    const arr = [...(next[list] as BetPreset[])];
    arr[idx] = { ...arr[idx], ...patch };
    (next[list] as BetPreset[]) = arr;
    setDraft(next);
  };
  const addPreset = (list: keyof Omit<BetSettings, "id">) => {
    const next = { ...draft };
    const arr = [...(next[list] as BetPreset[])];
    arr.push({ label: "新", multiplier: 2, basis: list === "postflopBet" ? "pot" : list === "postflopRaise" ? "call" : list === "pfRaiseStraddle" ? "str" : "bb" });
    (next[list] as BetPreset[]) = arr;
    setDraft(next);
  };
  const removePreset = (list: keyof Omit<BetSettings, "id">, idx: number) => {
    const next = { ...draft };
    const arr = [...(next[list] as BetPreset[])];
    arr.splice(idx, 1);
    (next[list] as BetPreset[]) = arr;
    setDraft(next);
  };

  const renderList = (
    title: string,
    list: keyof Omit<BetSettings, "id">,
    bases: BetPreset["basis"][]
  ) => (
    <div className="bg-neutral-900 border border-neutral-800 rounded p-3 space-y-2">
      <div className="text-sm font-bold">{title}</div>
      {(draft[list] as BetPreset[]).map((p, i) => (
        <div key={i} className="flex gap-1 items-center">
          <input
            value={p.label}
            onChange={(e) => editPreset(list, i, { label: e.target.value })}
            className="flex-1 text-sm"
            placeholder="ラベル"
          />
          <input
            type="number"
            onFocus={(e) => e.currentTarget.select()}
            value={p.multiplier}
            onChange={(e) => editPreset(list, i, { multiplier: parseFloat(e.target.value) || 0 })}
            className="w-16 text-sm"
          />
          <select
            value={p.basis}
            onChange={(e) => editPreset(list, i, { basis: e.target.value as BetPreset["basis"] })}
            className="w-16 text-sm"
          >
            {bases.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
          <button onClick={() => removePreset(list, i)} className="text-rose-400 px-2">✕</button>
        </div>
      ))}
      <button onClick={() => addPreset(list)} className="text-xs text-emerald-400">+ 追加</button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end" onClick={onClose}>
      <div
        className="bg-neutral-950 w-full max-w-xl mx-auto p-3 rounded-t-2xl border-t border-neutral-800 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-bold mb-3">ベット/レイズプリセット編集</div>
        {renderList("PF レイズ（通常）", "pfRaise", ["bb"])}
        {renderList("PF レイズ（ストラドル時）", "pfRaiseStraddle", ["str", "bb"])}
        {renderList("ポストフロップ ベット", "postflopBet", ["pot", "bb"])}
        {renderList("ポストフロップ レイズ", "postflopRaise", ["call", "pot", "bb"])}
        <div className="flex gap-2 mt-3 sticky bottom-0 bg-neutral-950 pt-2">
          <button onClick={onClose} className="flex-1 py-3 bg-neutral-800 rounded">キャンセル</button>
          <button onClick={() => onSave(draft)} className="flex-1 py-3 bg-felt-700 rounded font-bold">保存</button>
        </div>
      </div>
    </div>
  );
}
