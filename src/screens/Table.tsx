import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import TopBar from "../components/TopBar";
import { db } from "../db/db";
import { nextSeat } from "../utils/poker";
import { formatStakes } from "../utils/format";
import StackPicker from "../components/StackPicker";
import NamePicker from "../components/NamePicker";

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
      db.players.toArray().then((ps) => {
        const counts = new Map<string, number>();
        for (const p of ps) {
          const n = p.name.trim();
          if (!n) continue;
          counts.set(n, (counts.get(n) ?? 0) + 1);
        }
        return Array.from(counts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([n]) => n);
      }),
    []
  );

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
    if (session.heroSeat === null) {
      alert("Hero を選んでください");
      return;
    }
    if (session.buttonSeat === null) {
      alert("BTN を選んでください");
      return;
    }
    const now = Date.now();
    const active = players
      .filter((p) => !p.isAway && p.name.trim() !== "")
      .map((p) => p.seat);
    if (active.length < 2) {
      alert("プレイヤーが足りません（最低2人、名前未入力は空席扱い）");
      return;
    }
    const lastFinalized = lastHand?.finalized ?? false;
    let button = session.buttonSeat;
    if (lastFinalized) {
      button = nextSeat(button, session.seats, active) ?? button;
    } else if (!active.includes(button)) {
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
      <div className="p-3 grid grid-cols-2 gap-2 text-sm">
        <div
          className={`rounded p-2 text-center ${
            session.heroSeat !== null
              ? "bg-felt-900/40 border border-felt-700"
              : "bg-amber-900/40 border border-amber-700"
          }`}
        >
          <div className="text-[10px] text-neutral-400">Hero（必須）</div>
          <div className="font-bold">
            {session.heroSeat !== null ? `S${session.heroSeat}` : "未設定"}
          </div>
        </div>
        <div
          className={`rounded p-2 text-center ${
            session.buttonSeat !== null
              ? "bg-yellow-900/40 border border-yellow-700"
              : "bg-amber-900/40 border border-amber-700"
          }`}
        >
          <div className="text-[10px] text-neutral-400">BTN（必須）</div>
          <div className="font-bold">
            {session.buttonSeat !== null ? `S${session.buttonSeat}` : "未設定"}
          </div>
        </div>
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
              <NamePicker
                value={p.name}
                suggestions={nameSuggestions ?? []}
                onChange={(name) => updatePlayer(p.seat, { name })}
                className="flex-1 text-left py-2"
              />
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

      <div className="fixed bottom-0 inset-x-0 max-w-xl mx-auto p-3 bg-neutral-950/95 border-t border-neutral-800">
        {(() => {
          const ready =
            session.heroSeat !== null && session.buttonSeat !== null;
          const missing: string[] = [];
          if (session.heroSeat === null) missing.push("Hero");
          if (session.buttonSeat === null) missing.push("BTN");
          return (
            <button
              onClick={startHand}
              disabled={!ready}
              className={`w-full py-3 rounded font-bold text-lg ${
                ready
                  ? "bg-felt-700 hover:bg-felt-800"
                  : "bg-neutral-800 opacity-60"
              }`}
            >
              {ready
                ? "次のハンドを開始 ▶"
                : `${missing.join(" と ")} を選んでください`}
            </button>
          );
        })()}
      </div>
    </div>
  );
}
