import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../data/db";
import { Hands, Players, Sessions } from "../../data/repo";
import PokerTable from "../components/PokerTable";
import type { SeatVM } from "../components/PokerTable";
import { positionLabels } from "../positions";

/**
 * Cash Setup — minimal MVP:
 * - Visual table
 * - Tap to set Hero (sets the seat) / BTN (cycles through active seats)
 * - Start Hand: snapshots roster + stakes into a Hand row, navigates to /hands/:id
 */
export default function Setup() {
  const { sessionId } = useParams();
  const nav = useNavigate();
  const session = useLiveQuery(
    () => (sessionId ? db.sessions.get(sessionId) : undefined),
    [sessionId]
  );
  const roster = useLiveQuery(
    () =>
      sessionId
        ? db.sessionPlayers
            .where("sessionId")
            .equals(sessionId)
            .toArray()
            .then((rs) =>
              rs
                .filter((r) => r.deletedAt === null)
                .sort((a, b) => a.seat - b.seat)
            )
        : [],
    [sessionId]
  );

  const activeSeats = useMemo(
    () => (roster ?? []).filter((p) => !p.isAway && p.name.trim() !== "").map((p) => p.seat),
    [roster]
  );

  const positions = useMemo(
    () => positionLabels(activeSeats, session?.buttonSeat ?? null),
    [activeSeats, session?.buttonSeat]
  );

  if (!session || !roster) return null;

  const seatsVM: SeatVM[] = roster.map((p) => ({
    seat: p.seat,
    position: positions.get(p.seat) ?? "",
    name: p.name,
    stack: p.stack,
    isHero: p.isHero,
    isBTN: p.seat === session.buttonSeat,
    isCurrent: false,
    isFolded: p.isAway,
    isAllIn: false,
    cards: null,
    liveBet: 0,
  }));

  const onTapSeat = async (seat: number) => {
    // Cycle: if not hero and not BTN, become Hero. If Hero, become BTN. If both, clear.
    const p = roster.find((x) => x.seat === seat);
    if (!p) return;
    if (!p.isHero && session.buttonSeat !== seat) {
      for (const other of roster) {
        if (other.isHero && other.id !== p.id) {
          await Players.update(other.id, { isHero: false });
        }
      }
      await Players.update(p.id, { isHero: true });
      await Sessions.update(session.id, { heroSeat: seat });
      return;
    }
    if (p.isHero && session.buttonSeat !== seat) {
      await Sessions.update(session.id, { buttonSeat: seat });
      return;
    }
    if (session.buttonSeat === seat) {
      // both hero+btn → clear btn
      await Sessions.update(session.id, { buttonSeat: null });
    }
  };

  const ready =
    session.heroSeat !== null &&
    session.buttonSeat !== null &&
    activeSeats.length >= 2;

  const startHand = async () => {
    if (!ready) return;
    const prev = await Hands.lastForSession(session.id);
    const handNo = (prev?.handNo ?? 0) + 1;
    const seatsSnap = roster
      .filter((p) => activeSeats.includes(p.seat))
      .map((p) => ({
        seat: p.seat,
        name: p.name,
        startStack: p.stack ?? 0,
        posted: p.mustPostBB
          ? [
              {
                kind: "post" as const,
                amount: session.bb,
              },
              ...(p.postWithAnte
                ? [{ kind: "post_ante" as const, amount: session.bb * 0.5 }]
                : []),
            ]
          : [],
      }));
    const h = await Hands.create({
      sessionId: session.id,
      handNo,
      startedAt: Date.now(),
      endedAt: null,
      buttonSeat: session.buttonSeat!,
      sb: session.sb,
      bb: session.bb,
      ante: session.ante,
      autoStraddle: session.autoStraddle,
      straddleAmount: session.straddleAmount,
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
    // clear post flags after they're snapshotted
    for (const p of roster) {
      if (p.mustPostBB || p.postWithAnte) {
        await Players.update(p.id, { mustPostBB: false, postWithAnte: false });
      }
    }
    nav(`/sessions/${session.id}/hands/${h.id}`);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center px-3 py-2 border-b border-neutral-800">
        <div className="text-emerald-400 text-sm">v2 β</div>
        <div className="flex-1 text-center font-bold">Cash Setup</div>
        <button
          onClick={() => nav("/review")}
          className="text-xs px-2 py-1 bg-neutral-800 rounded"
        >
          履歴
        </button>
      </div>

      <div className="px-2 pt-2">
        <PokerTable
          totalSeats={session.seatCount}
          seats={seatsVM}
          pot={0}
          streetLabel=""
          board={[null, null, null, null, null]}
          aspectRatio="5/4"
          onTapSeat={onTapSeat}
        />
      </div>

      <div className="p-3 space-y-2">
        <div className="text-xs text-neutral-400">
          席タップ：未指定→Hero、Hero→BTN、両方→クリア
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
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

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded bg-blue-900/40 border border-blue-700 p-2 text-center">
            <div className="text-[10px] text-neutral-300">Blinds</div>
            <div className="font-bold">{session.sb} / {session.bb}</div>
          </div>
          <div
            className={`rounded p-2 text-center ${session.autoStraddle ? "bg-emerald-900/40 border border-emerald-700" : "bg-neutral-800 border border-neutral-700"}`}
          >
            <div className="text-[10px] text-neutral-300">Straddle</div>
            <div className="font-bold">{session.autoStraddle ? "ON" : "OFF"}</div>
          </div>
          <div className="rounded bg-neutral-800 border border-neutral-700 p-2 text-center">
            <div className="text-[10px] text-neutral-300">Ante</div>
            <div className="font-bold">{session.ante || "—"}</div>
          </div>
        </div>

        <button
          onClick={startHand}
          disabled={!ready}
          className={`w-full py-4 rounded font-bold text-lg ${
            ready
              ? "bg-emerald-600 hover:bg-emerald-700"
              : "bg-neutral-800 opacity-60"
          }`}
        >
          {ready
            ? "Start Hand ▶"
            : "Hero と BTN を席タップで選んでください"}
        </button>
      </div>
    </div>
  );
}
