import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../data/db";
import { Hands, Players, Sessions } from "../../data/repo";
import { nextActive } from "../../engine/setup";
import PokerTable from "../components/PokerTable";
import type { SeatVM } from "../components/PokerTable";
import {
  AdjustAllSheet,
  BlindsSheet,
  EditTableSheet,
  HeroPositionSheet,
  PlayerEditSheet,
} from "../components/SetupSheets";
import { positionLabels } from "../positions";

/**
 * Cash Setup — full MVP. All control flows are sheets so the table view
 * stays visible at the top; the screen never scrolls a control off-screen.
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
              rs.filter((r) => r.deletedAt === null).sort((a, b) => a.seat - b.seat)
            )
        : [],
    [sessionId]
  );
  const nameSuggestions = useLiveQuery(
    () =>
      db.sessionPlayers.toArray().then((ps) => {
        const counts = new Map<string, number>();
        for (const p of ps) {
          if (p.deletedAt !== null) continue;
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

  // sheets
  const [assignBtnMode, setAssignBtnMode] = useState(false);
  const [editingSeat, setEditingSeat] = useState<number | null>(null);
  const [showBlinds, setShowBlinds] = useState(false);
  const [showHero, setShowHero] = useState(false);
  const [showAdjustAll, setShowAdjustAll] = useState(false);
  const [showEditTable, setShowEditTable] = useState(false);

  const activeSeats = useMemo(
    () =>
      (roster ?? []).filter((p) => !p.isAway && p.name.trim() !== "").map((p) => p.seat),
    [roster]
  );

  const positions = useMemo(
    () => positionLabels(activeSeats, session?.buttonSeat ?? null),
    [activeSeats, session?.buttonSeat]
  );

  if (!session || !roster) {
    return (
      <div className="min-h-screen flex items-center justify-center text-neutral-500 text-sm">
        Loading session…
      </div>
    );
  }

  // ----- VM ----------------------------------------------------------------

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

  // ----- handlers ----------------------------------------------------------

  const onTapSeat = async (seat: number) => {
    if (assignBtnMode) {
      if (activeSeats.includes(seat)) {
        await Sessions.update(session.id, { buttonSeat: seat });
      }
      setAssignBtnMode(false);
      return;
    }
    setEditingSeat(seat);
  };

  const moveBtn = async (dir: "ccw" | "cw") => {
    if (session.buttonSeat === null || activeSeats.length === 0) return;
    let next: number | null = session.buttonSeat;
    if (dir === "cw") {
      next = nextActive(session.buttonSeat, session.seatCount, activeSeats);
    } else {
      const sorted = [...activeSeats].sort((a, b) => a - b);
      const idx = sorted.indexOf(session.buttonSeat);
      next = idx <= 0 ? sorted[sorted.length - 1] : sorted[idx - 1];
    }
    if (next !== null) await Sessions.update(session.id, { buttonSeat: next });
  };

  const setHero = async (seat: number) => {
    for (const p of roster) {
      if (p.isHero && p.seat !== seat) {
        await Players.update(p.id, { isHero: false });
      }
    }
    const target = roster.find((p) => p.seat === seat);
    if (target) await Players.update(target.id, { isHero: true });
    await Sessions.update(session.id, { heroSeat: seat });
    setShowHero(false);
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
              { kind: "post" as const, amount: session.bb },
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
    for (const p of roster) {
      if (p.mustPostBB || p.postWithAnte) {
        await Players.update(p.id, { mustPostBB: false, postWithAnte: false });
      }
    }
    nav(`/sessions/${session.id}/hands/${h.id}`);
  };

  const heroPositionLabel = (() => {
    if (session.heroSeat === null) return "—";
    return positions.get(session.heroSeat) ?? `S${session.heroSeat}`;
  })();

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center px-3 py-2 border-b border-neutral-800">
        <button onClick={() => nav("/settings")} className="text-neutral-300 text-lg px-2" title="Settings">
          ⚙
        </button>
        <div className="flex-1 text-center font-bold">Cash Setup</div>
        <button
          onClick={() => setShowEditTable(true)}
          className="text-emerald-400 text-lg px-2"
          title="Edit Poker Table"
        >
          👥
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
        {assignBtnMode && (
          <div className="bg-neutral-900/95 border border-neutral-800 rounded p-3 mt-2 text-center">
            <div className="text-sm font-bold">座席をタップして BTN を割り当て</div>
            <button
              onClick={() => setAssignBtnMode(false)}
              className="mt-2 px-3 py-1 bg-neutral-800 rounded text-xs"
            >
              キャンセル
            </button>
          </div>
        )}
      </div>

      <div className="p-3 space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setShowBlinds(true)}
            className="py-3 rounded bg-blue-500 font-bold text-sm"
          >
            Blinds
            <br />
            <span className="text-base">{session.sb} / {session.bb}</span>
          </button>
          <button
            onClick={async () => {
              await Sessions.update(session.id, {
                autoStraddle: !session.autoStraddle,
              });
            }}
            className={`py-3 rounded font-bold text-sm ${session.autoStraddle ? "bg-emerald-700" : "bg-neutral-700"}`}
          >
            Straddle
            <br />
            <span className="text-base">{session.autoStraddle ? "ON" : "OFF"}</span>
          </button>
          <button
            onClick={async () => {
              const next = session.ante > 0 ? 0 : session.bb;
              await Sessions.update(session.id, { ante: next });
            }}
            className={`py-3 rounded font-bold text-sm ${session.ante > 0 ? "bg-blue-700" : "bg-neutral-700"}`}
          >
            BB Ante
            <br />
            <span className="text-base">{session.ante > 0 ? session.ante : "OFF"}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-xs text-neutral-400">Move BTN:</div>
          <button
            onClick={() => moveBtn("ccw")}
            className="flex-1 py-2 bg-neutral-800 rounded text-sm"
          >
            ↺ CCW
          </button>
          <button
            onClick={() => moveBtn("cw")}
            className="flex-1 py-2 bg-neutral-800 rounded text-sm"
          >
            ↻ CW
          </button>
          <button
            onClick={() => setAssignBtnMode(true)}
            className="flex-1 py-2 bg-neutral-800 rounded text-sm text-emerald-400"
          >
            ➤ Assign
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setShowAdjustAll(true)}
            className="py-2 bg-neutral-800 rounded text-sm"
          >
            Adjust All Stacks
          </button>
          <button
            onClick={() => setShowHero(true)}
            className="py-2 bg-neutral-800 rounded text-sm"
          >
            Hero: <span className="text-emerald-400 font-bold">{heroPositionLabel}</span> ▾
          </button>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded p-3 space-y-2">
          <div>
            <label>日付</label>
            <input
              type="date"
              value={session.date}
              onChange={async (e) => {
                await Sessions.update(session.id, { date: e.target.value });
              }}
            />
          </div>
          <div>
            <label>カジノ / ロケーション</label>
            <input
              value={session.casino}
              placeholder="例: Bellagio"
              onChange={async (e) => {
                await Sessions.update(session.id, { casino: e.target.value });
              }}
            />
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
          {ready ? "Start Hand ▶" : "Hero と BTN を選んでください"}
        </button>
      </div>

      {editingSeat !== null && (() => {
        const p = roster.find((x) => x.seat === editingSeat);
        if (!p) return null;
        return (
          <PlayerEditSheet
            seat={editingSeat}
            player={p}
            bb={session.bb}
            suggestions={nameSuggestions ?? []}
            onClose={() => setEditingSeat(null)}
            onSave={async (patch) => {
              await Players.update(p.id, patch);
              setEditingSeat(null);
            }}
            onSitOut={async () => {
              await Players.update(p.id, { isAway: !p.isAway });
              setEditingSeat(null);
            }}
          />
        );
      })()}

      {showBlinds && (
        <BlindsSheet
          sb={session.sb}
          bb={session.bb}
          onCancel={() => setShowBlinds(false)}
          onSave={async (sb, bb) => {
            await Sessions.update(session.id, { sb, bb });
            setShowBlinds(false);
          }}
        />
      )}

      {showHero && (
        <HeroPositionSheet
          activeSeats={activeSeats}
          buttonSeat={session.buttonSeat}
          positions={positions}
          currentHero={session.heroSeat}
          onCancel={() => setShowHero(false)}
          onPick={setHero}
        />
      )}

      {showAdjustAll && (
        <AdjustAllSheet
          bb={session.bb}
          onCancel={() => setShowAdjustAll(false)}
          onApply={async (stack) => {
            for (const p of roster) await Players.update(p.id, { stack });
            setShowAdjustAll(false);
          }}
        />
      )}

      {showEditTable && (
        <EditTableSheet
          players={roster}
          buttonSeat={session.buttonSeat}
          positions={positions}
          suggestions={nameSuggestions ?? []}
          onClose={() => setShowEditTable(false)}
          onUpdate={async (seat, patch) => {
            const p = roster.find((x) => x.seat === seat);
            if (p) await Players.update(p.id, patch);
          }}
          onAdd={async () => {
            const max = roster.length > 0 ? Math.max(...roster.map((p) => p.seat)) : 0;
            if (max >= 11) return;
            await Players.create({
              sessionId: session.id,
              seat: max + 1,
              name: "Unknown",
              isHero: false,
              isAway: false,
              mustPostBB: false,
              postWithAnte: false,
              stack: 200,
              note: "",
            });
            await Sessions.update(session.id, { seatCount: max + 1 });
          }}
          onRemove={async () => {
            if (roster.length <= 2) return;
            const last = roster[roster.length - 1];
            await Players.remove(last.id);
            await Sessions.update(session.id, {
              seatCount: roster.length - 1,
              ...(last.isHero ? { heroSeat: null } : {}),
              ...(last.seat === session.buttonSeat ? { buttonSeat: null } : {}),
            });
          }}
        />
      )}
    </div>
  );
}
