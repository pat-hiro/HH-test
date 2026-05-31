import { Link, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import TopBar from "../components/TopBar";
import { exportSessionCSV, exportSessionJSON } from "../utils/export";
import { formatGame, formatStakes } from "../utils/format";

function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

export default function SessionListScreen() {
  const nav = useNavigate();
  const sessions = useLiveQuery(
    () => db.sessions.orderBy("startedAt").reverse().toArray(),
    []
  );

  const quickStart = async () => {
    const last = sessions?.[0];
    if (!last) {
      nav("/sessions/new");
      return;
    }
    const now = Date.now();
    const id = await db.sessions.add({
      startedAt: now,
      date: todayStr(),
      casino: last.casino,
      game: last.game,
      gameOther: last.gameOther ?? "",
      sb: last.sb,
      bb: last.bb,
      ante: last.ante,
      rake: last.rake,
      seats: last.seats,
      heroSeat: null,
      note: "",
      buttonSeat: null,
      autoStraddle: last.autoStraddle,
      straddleSeats: [],
    });
    for (let i = 1; i <= last.seats; i++) {
      await db.players.add({
        sessionId: id,
        seat: i,
        name: "Unknown",
        isHero: false,
        isAway: false,
        mustPostSB: false,
        mustPostBB: false,
        note: "",
        joinedAt: now,
      });
    }
    nav(`/sessions/${id}/setup`);
  };

  const hasPrior = (sessions?.length ?? 0) > 0;

  return (
    <div className="pb-24">
      <TopBar title="Dashboard" back="/" />
      <div className="p-3 space-y-2">
        {hasPrior && (
          <button
            onClick={quickStart}
            className="block w-full bg-felt-700 hover:bg-felt-800 text-center py-4 rounded font-bold"
          >
            ⚡ クイックスタート
            <div className="text-xs font-normal text-neutral-300 mt-1">
              前回の設定を継承・全席 Unknown・Hero と BTN だけ選ぶ
            </div>
          </button>
        )}
        <Link
          to="/sessions/new"
          className={`block w-full text-center py-3 rounded ${
            hasPrior
              ? "bg-neutral-800 text-sm"
              : "bg-felt-700 hover:bg-felt-800 font-semibold"
          }`}
        >
          ＋ 新しいセッション（詳細設定）
        </Link>
      </div>
      <ul className="px-3 space-y-2">
        {sessions?.map((s) => (
          <li
            key={s.id}
            className="bg-neutral-900 border border-neutral-800 rounded p-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">{s.casino || "(カジノ未設定)"}</div>
                <div className="text-xs text-neutral-400">
                  {s.date} · {formatStakes(s)} · {formatGame(s)}
                </div>
              </div>
              <div className="text-xs text-neutral-500">#{s.id}</div>
            </div>
            <div className="mt-2 flex gap-2 flex-wrap">
              <Link
                to={`/sessions/${s.id}/setup`}
                className="px-3 py-1 bg-emerald-700 rounded text-sm font-bold"
              >
                Setup
              </Link>
              <Link
                to={`/sessions/${s.id}/table`}
                className="px-3 py-1 bg-neutral-800 rounded text-xs"
              >
                旧UI
              </Link>
              <Link
                to={`/sessions/${s.id}/hands`}
                className="px-3 py-1 bg-neutral-800 rounded text-sm"
              >
                ハンド履歴
              </Link>
              <button
                onClick={() => s.id && exportSessionCSV(s.id)}
                className="px-3 py-1 bg-neutral-800 rounded text-sm"
              >
                CSV
              </button>
              <button
                onClick={() => s.id && exportSessionJSON(s.id)}
                className="px-3 py-1 bg-neutral-800 rounded text-sm"
              >
                JSON
              </button>
            </div>
          </li>
        ))}
        {sessions && sessions.length === 0 && (
          <li className="text-center text-neutral-500 py-8 text-sm">
            まだセッションがありません
          </li>
        )}
      </ul>
    </div>
  );
}
