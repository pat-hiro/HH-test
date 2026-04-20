import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import TopBar from "../components/TopBar";
import CardPicker from "../components/CardPicker";
import AmountInput from "../components/AmountInput";
import { db } from "../db/db";
import type { ActionType, Street } from "../db/types";
import { bbSeat, computeStreetState, handIsOver, nextSeat, sbSeat } from "../utils/poker";
import { formatCard } from "../utils/cards";

type PendingAmount = {
  type: ActionType;
  min: number;
  label: string;
} | null;

export default function HandInputScreen() {
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
  const events = useLiveQuery(
    () => db.events.where({ handId: handDbId }).toArray(),
    [handDbId]
  );

  const [street, setStreet] = useState<Street>("PF");
  const [pending, setPending] = useState<PendingAmount>(null);
  const [showExposed, setShowExposed] = useState(false);
  const [showNote, setShowNote] = useState(false);

  useEffect(() => {
    if (!hand) return;
    if (hand.board.river) setStreet("R");
    else if (hand.board.turn) setStreet("T");
    else if (hand.board.flop) setStreet("F");
    else setStreet("PF");
  }, [hand?.board]);

  const blindsPosted = useMemo(() => {
    if (!actions) return false;
    return actions.some((a) => a.type === "BLIND_BB");
  }, [actions]);

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

  if (!hand || !session || !players || !actions) return null;

  const currentPlayer =
    state?.currentSeat != null
      ? players.find((p) => p.seat === state.currentSeat)
      : null;

  const addAction = async (type: ActionType, amount: number) => {
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
      isAllIn: false,
    });
  };

  const onBtn = (type: ActionType) => {
    if (!state || state.currentSeat === null) return;
    if (type === "FOLD" || type === "CHECK") {
      addAction(type, 0);
      return;
    }
    if (type === "CALL") {
      addAction("CALL", state.toCall(state.currentSeat));
      return;
    }
    if (type === "BET") {
      setPending({ type: "BET", min: hand.bb, label: "ベット額" });
      return;
    }
    if (type === "RAISE") {
      let openIncrement = hand.bb;
      if (street === "PF") {
        const maxStraddle = actions
          .filter((a) => a.type === "STRADDLE" && a.street === "PF")
          .reduce((max, a) => Math.max(max, a.amount), 0);
        if (maxStraddle > 0) openIncrement = maxStraddle;
      }
      const minRaise = state.currentBet + Math.max(state.lastRaiseSize, openIncrement);
      setPending({
        type: "RAISE",
        min: minRaise,
        label: `レイズ合計額（最低 ${minRaise}）`,
      });
      return;
    }
    if (type === "ALL_IN") {
      setPending({ type: "ALL_IN", min: 0, label: "オールイン額" });
      return;
    }
  };

  const undo = async () => {
    const last = actions[actions.length - 1];
    if (!last || last.id === undefined) return;
    await db.actions.delete(last.id);
  };

  const canCheck = state ? state.currentSeat !== null && state.toCall(state.currentSeat) === 0 : false;
  const canCall = state ? state.currentSeat !== null && state.toCall(state.currentSeat) > 0 : false;
  const canBet = state ? state.currentBet === 0 : false;
  const canRaise = state ? state.currentBet > 0 : false;

  const firstToActPF = (() => {
    if (!session) return null;
    const bb = bbSeat(hand.buttonSeat, session.seats, hand.activeSeats);
    if (bb === null) return null;
    return nextSeat(bb, session.seats, hand.activeSeats);
  })();
  const straddleExists = actions.some((a) => a.type === "STRADDLE");
  const canStraddle =
    street === "PF" &&
    state?.currentSeat != null &&
    state.currentSeat === firstToActPF &&
    state.currentBet === hand.bb &&
    !straddleExists;

  const streetIsFinished = state?.done ?? false;
  const isOver = handIsOver(hand, actions);

  const setBoard = async (patch: Partial<typeof hand.board>) => {
    await db.hands.update(handDbId, { board: { ...hand.board, ...patch } });
  };

  const goToResult = () => {
    nav(`/sessions/${sessionId}/hands/${handDbId}/result`);
  };

  const addNote = async (text: string) => {
    await db.events.add({
      handId: handDbId,
      street,
      type: "NOTE",
      seat: null,
      cards: [],
      note: text,
      resolution: "",
      createdAt: Date.now(),
    });
  };

  const usedCards = [
    hand.board.flop?.[0],
    hand.board.flop?.[1],
    hand.board.flop?.[2],
    hand.board.turn,
    hand.board.river,
  ].filter((x): x is string => !!x);

  return (
    <div className="pb-40">
      <TopBar
        title={`#${hand.handNo}  BTN:S${hand.buttonSeat}`}
        back={`/sessions/${sessionId}/table`}
        right={
          <div className="flex gap-1">
            <button
              onClick={() => setShowNote(true)}
              className="text-xs px-2 py-1 bg-neutral-800 rounded"
            >
              メモ
            </button>
            <button
              onClick={() => setShowExposed(true)}
              className="text-xs px-2 py-1 bg-neutral-800 rounded"
            >
              露出
            </button>
            <button
              onClick={undo}
              className="text-xs px-2 py-1 bg-neutral-800 rounded"
            >
              UNDO
            </button>
          </div>
        }
      />

      <div className="p-3 sticky top-12 z-10 bg-neutral-950/95 border-b border-neutral-800">
        <div className="flex justify-between text-xs text-neutral-400">
          <div>POT {state?.pot ?? 0}</div>
          <div>
            toCall{" "}
            {state && state.currentSeat !== null
              ? state.toCall(state.currentSeat)
              : 0}
          </div>
          <div>lastRaise {state?.lastRaiseSize ?? 0}</div>
          <div>残 {state?.remaining.length ?? 0}</div>
        </div>
        <div className="flex gap-1 mt-2">
          {(["PF", "F", "T", "R"] as Street[]).map((s) => (
            <button
              key={s}
              onClick={() => setStreet(s)}
              className={`flex-1 py-1 rounded text-sm ${
                street === s ? "bg-felt-700" : "bg-neutral-800"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="p-3">
        {street !== "PF" && (
          <div className="mb-3 bg-neutral-900 border border-neutral-800 rounded p-3">
            <div className="flex items-end gap-3">
              <div>
                <div className="text-[10px] text-neutral-500 mb-1">Flop</div>
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <CardPicker
                      key={`f${i}`}
                      size="sm"
                      value={hand.board.flop?.[i] ?? null}
                      exclude={usedCards}
                      onChange={(c) => {
                        const cur = hand.board.flop ?? [null, null, null];
                        const next = [...cur] as [
                          string | null,
                          string | null,
                          string | null
                        ];
                        next[i] = c;
                        if (next[0] && next[1] && next[2]) {
                          setBoard({
                            flop: [next[0], next[1], next[2]] as [
                              string,
                              string,
                              string
                            ],
                          });
                        } else {
                          setBoard({ flop: null });
                        }
                      }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-neutral-500 mb-1">Turn</div>
                <CardPicker
                  size="sm"
                  value={hand.board.turn ?? null}
                  exclude={usedCards}
                  onChange={(c) => setBoard({ turn: c })}
                />
              </div>
              <div>
                <div className="text-[10px] text-neutral-500 mb-1">River</div>
                <CardPicker
                  size="sm"
                  value={hand.board.river ?? null}
                  exclude={usedCards}
                  onChange={(c) => setBoard({ river: c })}
                />
              </div>
            </div>
          </div>
        )}

        {currentPlayer && (
          <div className="bg-felt-900 border border-felt-700 rounded p-4 mb-3">
            <div className="text-xs text-neutral-400">行動中</div>
            <div className="text-2xl font-bold">
              S{currentPlayer.seat}{" "}
              <span className="text-neutral-300">
                {currentPlayer.name || "—"}
              </span>
            </div>
            {currentPlayer.stack !== undefined && (
              <div className="text-xs text-neutral-400 mt-1">
                Stack {currentPlayer.stack}
              </div>
            )}
          </div>
        )}

        {!isOver && !streetIsFinished && currentPlayer && (
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => onBtn("FOLD")}
              className="py-4 bg-red-800 rounded font-bold"
            >
              FOLD
            </button>
            {canCheck ? (
              <button
                onClick={() => onBtn("CHECK")}
                className="py-4 bg-neutral-700 rounded font-bold"
              >
                CHECK
              </button>
            ) : (
              <button
                disabled={!canCall}
                onClick={() => onBtn("CALL")}
                className="py-4 bg-blue-800 rounded font-bold disabled:opacity-30"
              >
                CALL{" "}
                {state && state.currentSeat !== null
                  ? state.toCall(state.currentSeat)
                  : ""}
              </button>
            )}
            <button
              onClick={() => onBtn("ALL_IN")}
              className="py-4 bg-purple-800 rounded font-bold"
            >
              ALL-IN
            </button>
            {canStraddle && (
              <button
                onClick={async () => {
                  if (state?.currentSeat == null) return;
                  const nextOrder =
                    (actions[actions.length - 1]?.order ?? -1) + 1;
                  await db.actions.add({
                    handId: handDbId,
                    order: nextOrder,
                    street: "PF",
                    seat: state.currentSeat,
                    type: "STRADDLE",
                    amount: hand.bb * 2,
                    totalPutIn: hand.bb * 2,
                    isAllIn: false,
                  });
                }}
                className="col-span-3 py-4 bg-amber-700 rounded font-bold"
              >
                STRADDLE {hand.bb * 2}
              </button>
            )}
            {canBet && (
              <button
                onClick={() => onBtn("BET")}
                className="col-span-3 py-4 bg-emerald-700 rounded font-bold"
              >
                BET
              </button>
            )}
            {canRaise && (
              <button
                onClick={() => onBtn("RAISE")}
                className="col-span-3 py-4 bg-emerald-700 rounded font-bold"
              >
                RAISE
              </button>
            )}
          </div>
        )}

        {(isOver || streetIsFinished) && (
          <div className="space-y-2 mt-3">
            {!isOver && street !== "R" && (
              <button
                onClick={() => {
                  const nxt: Street = street === "PF" ? "F" : street === "F" ? "T" : "R";
                  setStreet(nxt);
                }}
                className="w-full py-3 bg-felt-700 rounded font-bold"
              >
                次のストリート →
              </button>
            )}
            <button
              onClick={goToResult}
              className="w-full py-3 bg-yellow-700 rounded font-bold"
            >
              結果入力へ →
            </button>
          </div>
        )}

        <div className="mt-6">
          <div className="text-xs text-neutral-400 mb-1">アクションログ</div>
          <ol className="text-sm space-y-1">
            {actions.map((a) => (
              <li
                key={a.id}
                className="flex gap-2 text-neutral-300 font-mono text-xs"
              >
                <span className="text-neutral-500 w-6">{a.street}</span>
                <span className="w-8">S{a.seat}</span>
                <span className="flex-1">{a.type}</span>
                <span>{a.amount > 0 ? a.amount : ""}</span>
              </li>
            ))}
          </ol>
          {events && events.length > 0 && (
            <div className="mt-3">
              <div className="text-xs text-neutral-400 mb-1">イベント</div>
              <ul className="text-xs space-y-1">
                {events.map((e) => (
                  <li key={e.id} className="text-neutral-300">
                    [{e.type}] {e.street ?? ""}{" "}
                    {e.seat !== null ? `S${e.seat}` : ""}{" "}
                    {e.cards.map(formatCard).join(" ")} {e.note}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {pending && state && (() => {
        const maxStraddle = actions
          .filter((a) => a.type === "STRADDLE" && a.street === "PF")
          .reduce((max, a) => Math.max(max, a.amount), 0);
        const usingStraddleUnit = street === "PF" && maxStraddle > 0;
        const unitAmount = usingStraddleUnit ? maxStraddle : hand.bb;
        const unitLabel = usingStraddleUnit ? "STR" : "BB";
        return (
        <AmountInput
          unitAmount={unitAmount}
          unitLabel={unitLabel}
          pot={state.pot}
          toCall={
            state.currentSeat !== null ? state.toCall(state.currentSeat) : 0
          }
          min={pending.min}
          label={pending.label}
          onCancel={() => setPending(null)}
          onSubmit={async (amount) => {
            const t = pending.type;
            setPending(null);
            if (t === "ALL_IN") {
              const nextOrder = (actions[actions.length - 1]?.order ?? -1) + 1;
              if (state.currentSeat === null) return;
              await db.actions.add({
                handId: handDbId,
                order: nextOrder,
                street,
                seat: state.currentSeat,
                type: "ALL_IN",
                amount,
                totalPutIn: amount,
                isAllIn: true,
              });
              return;
            }
            await addAction(t, amount);
          }}
        />
        );
      })()}

      {showExposed && (
        <ExposedCardDialog
          handId={handDbId}
          street={street}
          players={players}
          onClose={() => setShowExposed(false)}
        />
      )}
      {showNote && (
        <NoteDialog
          onCancel={() => setShowNote(false)}
          onSubmit={(t) => {
            addNote(t);
            setShowNote(false);
          }}
        />
      )}
    </div>
  );
}

function ExposedCardDialog({
  handId,
  street,
  players,
  onClose,
}: {
  handId: number;
  street: Street;
  players: { seat: number; name: string }[];
  onClose: () => void;
}) {
  const [seat, setSeat] = useState<number | null>(null);
  const [c1, setC1] = useState<string | null>(null);
  const [c2, setC2] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [resolution, setResolution] = useState("");

  const save = async () => {
    const cards = [c1, c2].filter((c): c is string => !!c);
    await db.events.add({
      handId,
      street,
      type: "EXPOSED_CARD",
      seat,
      cards,
      note: reason,
      resolution,
      createdAt: Date.now(),
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-black/80 flex items-end"
      onClick={onClose}
    >
      <div
        className="bg-neutral-900 w-full max-w-xl mx-auto p-4 rounded-t-xl border-t border-neutral-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-semibold mb-2">露出カード記録</div>
        <div className="mb-2">
          <label>対象Seat</label>
          <select
            value={seat ?? ""}
            onChange={(e) =>
              setSeat(e.target.value ? Number(e.target.value) : null)
            }
          >
            <option value="">選択</option>
            {players.map((p) => (
              <option key={p.seat} value={p.seat}>
                S{p.seat} {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 mb-2">
          <CardPicker value={c1} onChange={setC1} label="カード1" />
          <CardPicker value={c2} onChange={setC2} label="カード2" />
        </div>
        <div className="mb-2">
          <label>理由</label>
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">—</option>
            <option>Dealer error</option>
            <option>Player flash</option>
            <option>Misdeal suspect</option>
            <option>Other</option>
          </select>
        </div>
        <div className="mb-3">
          <label>取り扱い</label>
          <select
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
          >
            <option value="">—</option>
            <option>Misdeal</option>
            <option>Play continues</option>
            <option>Card replaced</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 bg-neutral-800 rounded">
            キャンセル
          </button>
          <button onClick={save} className="flex-1 py-3 bg-felt-700 rounded font-bold">
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function NoteDialog({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState("");
  return (
    <div
      className="fixed inset-0 z-40 bg-black/80 flex items-end"
      onClick={onCancel}
    >
      <div
        className="bg-neutral-900 w-full max-w-xl mx-auto p-4 rounded-t-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <label>ハンドメモ</label>
        <textarea
          autoFocus
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex gap-2 mt-3">
          <button onClick={onCancel} className="flex-1 py-3 bg-neutral-800 rounded">
            キャンセル
          </button>
          <button
            onClick={() => onSubmit(text)}
            className="flex-1 py-3 bg-felt-700 rounded font-bold"
          >
            追加
          </button>
        </div>
      </div>
    </div>
  );
}
