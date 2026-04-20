import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import TopBar from "../components/TopBar";
import { exportSessionCSV, exportSessionJSON } from "../utils/export";

export default function SessionListScreen() {
  const sessions = useLiveQuery(
    () => db.sessions.orderBy("startedAt").reverse().toArray(),
    []
  );

  return (
    <div className="pb-24">
      <TopBar title="セッション" />
      <div className="p-3">
        <Link
          to="/sessions/new"
          className="block w-full bg-felt-700 hover:bg-felt-800 text-center py-3 rounded font-semibold"
        >
          ＋ 新しいセッション
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
                  {s.date} · {s.stakesLabel} · {s.game}
                </div>
              </div>
              <div className="text-xs text-neutral-500">#{s.id}</div>
            </div>
            <div className="mt-2 flex gap-2 flex-wrap">
              <Link
                to={`/sessions/${s.id}/table`}
                className="px-3 py-1 bg-neutral-800 rounded text-sm"
              >
                テーブル
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
