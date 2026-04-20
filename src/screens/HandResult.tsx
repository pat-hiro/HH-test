import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import TopBar from "../components/TopBar";
import { db } from "../db/db";
import type { PotShare } from "../db/types";

export default function HandResultScreen() {
  const { id, handId } = useParams();
  const sessionId = Number(id);
  const handDbId = Number(handId);
  const nav = useNavigate();

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
    () => db.actions.where({ handId: handDbId }).toArray(),
    [handDbId]
  );

  const [shares, setShares] = useState<Record<number, string>>({});
  const [showdown, setShowdown] = useState(false);
  const [note, setNote] = useState("");

  if (!hand || !players || !actions) return null;

  const folded = new Set(
    actions.filter((a) => a.type === "FOLD").map((a) => a.seat)
  );
  const surviving = hand.activeSeats.filter((s) => !folded.has(s));

  const totalPot = actions
    .filter((a) => a.type !== "FOLD" && a.type !== "CHECK")
    .reduce((acc, a) => acc + a.amount, 0);

  const remainder =
    totalPot -
    Object.values(shares).reduce((acc, v) => acc + (parseFloat(v) || 0), 0);

  const finalize = async () => {
    const winners: PotShare[] = [];
    for (const s of Object.keys(shares)) {
      const amt = parseFloat(shares[Number(s)]) || 0;
      if (amt > 0) winners.push({ seat: Number(s), amount: amt });
    }
    if (winners.length === 0 && surviving.length === 1) {
      winners.push({ seat: surviving[0], amount: totalPot });
    }
    await db.hands.update(handDbId, {
      winners,
      pot: totalPot,
      wentToShowdown: showdown,
      finalized: true,
      endedAt: Date.now(),
      note,
    });
    nav(`/sessions/${sessionId}/table`);
  };

  const assignAll = (seat: number) => {
    setShares({ [seat]: String(totalPot) });
  };

  return (
    <div className="pb-24">
      <TopBar
        title={`結果入力 #${hand.handNo}`}
        back={`/sessions/${sessionId}/hands/${handDbId}/input`}
      />
      <div className="p-3 space-y-3">
        <div className="bg-neutral-900 rounded p-3 text-sm">
          <div>合計ポット: {totalPot}</div>
          <div>残存: {surviving.map((s) => `S${s}`).join(", ") || "—"}</div>
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showdown}
            onChange={(e) => setShowdown(e.target.checked)}
          />
          ショーダウンに行った
        </label>

        <div>
          <label>勝者とポット配分</label>
          <ul className="space-y-2">
            {surviving.map((s) => {
              const p = players.find((x) => x.seat === s);
              return (
                <li key={s} className="flex gap-2 items-center">
                  <div className="w-20">
                    S{s} {p?.name ?? ""}
                  </div>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={shares[s] ?? ""}
                    onChange={(e) =>
                      setShares({ ...shares, [s]: e.target.value })
                    }
                    placeholder="0"
                  />
                  <button
                    onClick={() => assignAll(s)}
                    className="px-3 py-2 bg-neutral-800 rounded text-xs whitespace-nowrap"
                  >
                    全額
                  </button>
                </li>
              );
            })}
          </ul>
          <div
            className={`text-xs mt-1 ${
              remainder === 0 ? "text-neutral-500" : "text-amber-400"
            }`}
          >
            配分残: {remainder}
          </div>
        </div>

        <div>
          <label>ハンドメモ</label>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <button
          onClick={finalize}
          className="w-full py-3 bg-felt-700 rounded font-bold"
        >
          ハンド確定
        </button>
      </div>
    </div>
  );
}
