import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import TopBar from "../components/TopBar";
import { db } from "../db/db";
import { exportSessionCSV, exportSessionJSON } from "../utils/export";
import { formatCard } from "../utils/cards";

export default function HandListScreen() {
  const { id } = useParams();
  const sessionId = Number(id);
  const session = useLiveQuery(() => db.sessions.get(sessionId), [sessionId]);
  const hands = useLiveQuery(
    () =>
      db.hands
        .where({ sessionId })
        .toArray()
        .then((hs) => hs.sort((a, b) => b.handNo - a.handNo)),
    [sessionId]
  );

  if (!session || !hands) return null;

  const del = async (handId: number) => {
    if (!confirm("このハンドを削除？")) return;
    await db.actions.where({ handId }).delete();
    await db.events.where({ handId }).delete();
    await db.hands.delete(handId);
  };

  return (
    <div className="pb-24">
      <TopBar
        title={`履歴 (${hands.length})`}
        back={`/sessions/${sessionId}/table`}
        right={
          <div className="flex gap-1">
            <button
              onClick={() => exportSessionCSV(sessionId)}
              className="text-xs px-2 py-1 bg-neutral-800 rounded"
            >
              CSV
            </button>
            <button
              onClick={() => exportSessionJSON(sessionId)}
              className="text-xs px-2 py-1 bg-neutral-800 rounded"
            >
              JSON
            </button>
          </div>
        }
      />
      <ul className="px-3 space-y-2">
        {hands.map((h) => (
          <li
            key={h.id}
            className="bg-neutral-900 border border-neutral-800 rounded p-3"
          >
            <div className="flex items-center justify-between">
              <div className="font-semibold">
                #{h.handNo}{" "}
                <span className="text-xs text-neutral-500">
                  {h.finalized ? "確定" : "進行中"}
                </span>
              </div>
              <div className="text-xs text-neutral-400">BTN S{h.buttonSeat}</div>
            </div>
            <div className="text-xs text-neutral-400 mt-1 font-mono">
              {h.board.flop ? h.board.flop.map(formatCard).join(" ") : "—"}{" "}
              {h.board.turn ? `| ${formatCard(h.board.turn)}` : ""}{" "}
              {h.board.river ? `| ${formatCard(h.board.river)}` : ""}
            </div>
            <div className="text-xs text-neutral-300 mt-1">
              POT {h.pot} ·{" "}
              {h.winners.length > 0
                ? h.winners.map((w) => `S${w.seat}+${w.amount}`).join(", ")
                : "—"}
            </div>
            <div className="mt-2 flex gap-2">
              <Link
                to={`/sessions/${sessionId}/hands/${h.id}/input`}
                className="px-3 py-1 bg-neutral-800 rounded text-xs"
              >
                入力/編集
              </Link>
              <Link
                to={`/sessions/${sessionId}/hands/${h.id}/result`}
                className="px-3 py-1 bg-neutral-800 rounded text-xs"
              >
                結果
              </Link>
              <button
                onClick={() => h.id && del(h.id)}
                className="px-3 py-1 bg-red-900/60 rounded text-xs ml-auto"
              >
                削除
              </button>
            </div>
          </li>
        ))}
        {hands.length === 0 && (
          <li className="text-center text-neutral-500 py-8 text-sm">
            ハンドなし
          </li>
        )}
      </ul>
    </div>
  );
}
