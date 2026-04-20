import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import TopBar from "../components/TopBar";
import { db } from "../db/db";
import { nextSeat } from "../utils/poker";
import { formatStakes } from "../utils/format";
import StackPicker from "../components/StackPicker";

export default function TableScreen() {
  const { id } = useParams();
  const sessionId = Number(id);
  const nav = useNavigate();
  const session = useLiveQuery(() => db.sessions.get(sessionId), [sessionId]);
  const players = useLiveQuery(
    () =>
      db.players
        .where({ sessionId })
        .toArray()
        .then((ps) => ps.sort((a, b) => a.seat - b.seat)),
    [sessionId]
  );
  const lastHand = useLiveQuery(
    () =>
      db.hands
        .where({ sessionId })
        .reverse()
        .sortBy("handNo")
        .then((hs) => hs[0]),
    [sessionId]
  );
  const nameSuggestions = useLiveQuery(
    () =>
      db.players
        .toArray()
        .then((ps) =>
          Array.from(new Set(ps.map((p) => p.name).filter((n) => n.length > 0)))
        ),
    []
  );

  const [editing, setEditing] = useState<number | null>(null);

  if (!session || !players) return null;

  const updatePlayer = async (seat: number, patch: Partial<typeof players[number]>) => {
    const p = players.find((x) => x.seat === seat);
    if (!p || p.id === undefined) return;
    await db.players.update(p.id, patch);
  };

  const setHero = async (seat: number) => {
    for (const p of players) {
      if (p.id === undefined) continue;
      await db.players.update(p.id, { isHero: p.seat === seat });
    }
    await db.sessions.update(sessionId, { heroSeat: seat });
  };

  const startHand = async () => {
    const now = Date.now();
    const active = players.filter((p) => !p.isAway).map((p) => p.seat);
    if (active.length < 2) {
      alert("プレイヤーが足りません（最低2人）");
      return;
    }
    let button = session.buttonSeat;
    if (button === null) {
      button = active[0];
    } else {
      button = nextSeat(button, session.seats, active) ?? active[0];
    }
    const handNo = (lastHand?.handNo ?? 0) + 1;
    const handId = await db.hands.add({
      sessionId,
      handNo,
      startedAt: now,
      buttonSeat: button,
      sb: session.sb,
      bb: session.bb,
      ante: session.ante,
      activeSeats: active,
      board: { flop: null, turn: null, river: null },
      pot: 0,
      rake: 0,
      winners: [],
      wentToShowdown: false,
      note: "",
      finalized: false,
    });
    await db.sessions.update(sessionId, { buttonSeat: button });
    nav(`/sessions/${sessionId}/hands/${handId}/input`);
  };

  return (
    <div className="pb-28">
      <TopBar
        title={`${session.casino || "セッション"} · ${formatStakes(session)}`}
        back="/"
        right={
          <button
            onClick={() => nav(`/sessions/${sessionId}/hands`)}
            className="text-sm px-2 py-1 bg-neutral-800 rounded"
          >
            履歴
          </button>
        }
      />
      <div className="p-3 text-sm text-neutral-400">
        Button: S{session.buttonSeat ?? "—"} · Hero: S{session.heroSeat ?? "—"}
      </div>

      <ul className="px-3 space-y-2">
        {players.map((p) => (
          <li
            key={p.seat}
            className={`rounded border p-3 ${
              p.isHero
                ? "border-felt-700 bg-felt-900/40"
                : "border-neutral-800 bg-neutral-900"
            }`}
          >
            <div className="flex items-center gap-2">
              <div className="w-10 text-center font-mono text-neutral-400">
                S{p.seat}
              </div>
              {editing === p.seat ? (
                <input
                  autoFocus
                  list="name-suggestions"
                  defaultValue={p.name}
                  onBlur={(e) => {
                    updatePlayer(p.seat, { name: e.target.value });
                    setEditing(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      updatePlayer(p.seat, {
                        name: (e.target as HTMLInputElement).value,
                      });
                      setEditing(null);
                    }
                  }}
                />
              ) : (
                <button
                  onClick={() => setEditing(p.seat)}
                  className="flex-1 text-left py-2"
                >
                  {p.name || <span className="text-neutral-500">（名前）</span>}
                </button>
              )}
              <StackPicker
                value={p.stack}
                bb={session.bb}
                onChange={(v) => updatePlayer(p.seat, { stack: v })}
              />
            </div>
            <div className="flex flex-wrap gap-2 mt-2 text-xs">
              <button
                onClick={() => setHero(p.seat)}
                className={`px-2 py-1 rounded ${
                  p.isHero ? "bg-felt-700" : "bg-neutral-800"
                }`}
              >
                Hero
              </button>
              <button
                onClick={() => updatePlayer(p.seat, { isAway: !p.isAway })}
                className={`px-2 py-1 rounded ${
                  p.isAway ? "bg-amber-700" : "bg-neutral-800"
                }`}
              >
                {p.isAway ? "Away" : "着席"}
              </button>
              <button
                onClick={() =>
                  updatePlayer(p.seat, { mustPostBB: !p.mustPostBB })
                }
                className={`px-2 py-1 rounded ${
                  p.mustPostBB ? "bg-blue-700" : "bg-neutral-800"
                }`}
              >
                Post BB
              </button>
              <button
                onClick={() =>
                  updatePlayer(p.seat, { mustPostSB: !p.mustPostSB })
                }
                className={`px-2 py-1 rounded ${
                  p.mustPostSB ? "bg-blue-700" : "bg-neutral-800"
                }`}
              >
                Post SB
              </button>
              <button
                onClick={async () => {
                  const cur = session.buttonSeat;
                  await db.sessions.update(sessionId, {
                    buttonSeat: cur === p.seat ? null : p.seat,
                  });
                }}
                className={`px-2 py-1 rounded ${
                  session.buttonSeat === p.seat
                    ? "bg-yellow-600"
                    : "bg-neutral-800"
                }`}
              >
                BTN
              </button>
            </div>
          </li>
        ))}
      </ul>

      <datalist id="name-suggestions">
        {nameSuggestions?.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      <div className="fixed bottom-0 inset-x-0 max-w-xl mx-auto p-3 bg-neutral-950/95 border-t border-neutral-800">
        <button
          onClick={startHand}
          className="w-full bg-felt-700 hover:bg-felt-800 py-3 rounded font-bold text-lg"
        >
          次のハンドを開始 ▶
        </button>
      </div>
    </div>
  );
}
