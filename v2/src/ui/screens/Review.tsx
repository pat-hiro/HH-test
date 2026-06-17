import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../data/db";
import { Actions, Hands } from "../../data/repo";
import { computeState } from "../../engine/reducer";
import { makeSetup } from "../../engine/setup";
import type { Hand } from "../../data/types";
import { exportSessionCSV, exportSessionJSON } from "../export";

/**
 * Review — hand history list with quick filters, detail drill-in, exports.
 * MVP: filter by session, board-tag chips, hand row shows handNo / stakes /
 * board / pot / Hero net. Detail view replays the action log inline.
 */
export default function Review() {
  const nav = useNavigate();
  const sessions = useLiveQuery(() => db.sessions.toArray(), []);
  const allHands = useLiveQuery(() => db.hands.toArray(), []);
  const [filterSession, setFilterSession] = useState<string | "all">("all");
  const [filterShowdown, setFilterShowdown] = useState<"any" | "yes" | "no">("any");
  const [opened, setOpened] = useState<string | null>(null);

  if (!sessions || !allHands) return null;

  const sessionsAlive = sessions
    .filter((s) => s.deletedAt === null)
    .sort((a, b) => b.startedAt - a.startedAt);

  const handsAlive = allHands.filter((h) => h.deletedAt === null);

  const filtered = handsAlive
    .filter((h) => filterSession === "all" || h.sessionId === filterSession)
    .filter(
      (h) =>
        filterShowdown === "any" ||
        (filterShowdown === "yes" && h.result.wentToShowdown) ||
        (filterShowdown === "no" && !h.result.wentToShowdown)
    )
    .sort((a, b) => b.startedAt - a.startedAt);

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center px-3 py-2 border-b border-neutral-800">
        <button onClick={() => nav(-1)} className="text-emerald-400 text-sm">
          ‹ Back
        </button>
        <div className="flex-1 text-center font-bold">Review</div>
        {filterSession !== "all" && (
          <div className="flex gap-1">
            <button
              onClick={() => exportSessionCSV(filterSession)}
              className="text-xs px-2 py-1 bg-neutral-800 rounded"
            >
              CSV
            </button>
            <button
              onClick={() => exportSessionJSON(filterSession)}
              className="text-xs px-2 py-1 bg-neutral-800 rounded"
            >
              JSON
            </button>
          </div>
        )}
      </div>

      {/* filters */}
      <div className="p-3 space-y-2">
        <div>
          <label>セッション</label>
          <select
            value={filterSession}
            onChange={(e) => setFilterSession(e.target.value as string)}
          >
            <option value="all">全セッション</option>
            {sessionsAlive.map((s) => (
              <option key={s.id} value={s.id}>
                {s.date} · {s.casino || "(未設定)"} · {s.sb}/{s.bb}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 text-xs">
          {(["any", "yes", "no"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilterShowdown(k)}
              className={`px-3 py-1 rounded ${filterShowdown === k ? "bg-blue-500" : "bg-neutral-800"}`}
            >
              {k === "any" ? "すべて" : k === "yes" ? "SD有り" : "非SD"}
            </button>
          ))}
        </div>
      </div>

      <ul className="flex-1 px-3 space-y-2">
        {filtered.length === 0 && (
          <li className="text-center text-sm text-neutral-500 py-4">
            該当するハンドがありません
          </li>
        )}
        {filtered.map((h) => (
          <HandRow
            key={h.id}
            hand={h}
            opened={opened === h.id}
            onToggle={() => setOpened(opened === h.id ? null : h.id)}
          />
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------

function HandRow({
  hand,
  opened,
  onToggle,
}: {
  hand: Hand;
  opened: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="bg-neutral-900 border border-neutral-800 rounded">
      <button onClick={onToggle} className="w-full text-left p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-sm">
              #{hand.handNo} ·{" "}
              <span className="text-neutral-400">
                {hand.sb}/{hand.bb}
              </span>
            </div>
            <div className="text-[11px] text-neutral-400">
              {new Date(hand.startedAt).toLocaleString()}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold">Pot {hand.pot}</div>
            <div className="text-[11px] text-neutral-400">
              {hand.result.wentToShowdown ? "SD" : "非SD"}
              {hand.finalized ? "" : " · 未確定"}
            </div>
          </div>
        </div>
        <div className="text-[11px] text-neutral-300 font-mono mt-1">
          {hand.board.flop ? hand.board.flop.join(" ") : "—"}
          {hand.board.turn ? ` | ${hand.board.turn}` : ""}
          {hand.board.river ? ` | ${hand.board.river}` : ""}
        </div>
      </button>
      {opened && <HandDetail hand={hand} />}
    </li>
  );
}

function HandDetail({ hand }: { hand: Hand }) {
  const stored = useLiveQuery(() => Actions.forHand(hand.id), [hand.id]);
  const summary = useMemo(() => {
    if (!stored) return null;
    const setup = makeSetup({
      seats: hand.seats.map((s) => ({ seat: s.seat, startStack: s.startStack })),
      seatCount: 11,
      buttonSeat: hand.buttonSeat,
      sb: hand.sb,
      bb: hand.bb,
      bbAnte: hand.ante,
      autoStraddle: hand.autoStraddle,
      straddleAmount: hand.straddleAmount > 0 ? hand.straddleAmount : undefined,
    });
    const engineActions = stored.map((a) => ({
      street: a.street,
      seat: a.seat,
      type: a.type,
      amount: a.amount,
    }));
    return computeState(setup, engineActions);
  }, [hand, stored]);

  if (!stored || !summary) return null;

  return (
    <div className="border-t border-neutral-800 p-3 space-y-2 text-xs">
      <div className="grid grid-cols-2 gap-1 text-[11px]">
        {hand.seats.map((s) => {
          const spent = summary.spentTotal[s.seat] ?? 0;
          const won = hand.result.winners.find((w) => w.seat === s.seat)?.amount ?? 0;
          const net = won - spent;
          return (
            <div key={s.seat} className="flex justify-between">
              <span className="text-neutral-300">
                S{s.seat} {s.name}
              </span>
              <span className={net >= 0 ? "text-emerald-400" : "text-rose-400"}>
                {net >= 0 ? "+" : ""}
                {net}
              </span>
            </div>
          );
        })}
      </div>

      <div className="border-t border-neutral-800 pt-2">
        <div className="text-[10px] text-neutral-400 mb-1">Action log</div>
        <div className="font-mono text-[11px] space-y-0.5">
          {stored.map((a) => (
            <div key={a.id} className="flex gap-2">
              <span className="text-neutral-500 w-8">{a.street}</span>
              <span className="w-8">S{a.seat}</span>
              <span className="flex-1 uppercase">{a.type}</span>
              <span>{a.amount > 0 ? a.amount : ""}</span>
            </div>
          ))}
        </div>
      </div>

      {hand.note && (
        <div className="border-t border-neutral-800 pt-2">
          <div className="text-[10px] text-neutral-400 mb-1">Note</div>
          <div className="text-sm">{hand.note}</div>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          onClick={async () => {
            if (!confirm("このハンドを削除しますか？（取り消し可能）")) return;
            await Hands.remove(hand.id);
          }}
          className="text-xs text-rose-400 px-2"
        >
          削除
        </button>
      </div>
    </div>
  );
}
