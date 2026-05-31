import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../db/db";
import type { Player } from "../db/types";
import PokerTable from "../components/PokerTable";
import type { SeatRenderInfo } from "../components/PokerTable";
import StackPicker from "../components/StackPicker";
import NamePicker from "../components/NamePicker";
import { getPositionLabels } from "../utils/positions";
import { nextSeat } from "../utils/poker";

type Mode = "default" | "assignBtn";

export default function TableSetupScreen() {
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

  const [mode, setMode] = useState<Mode>("default");
  const [editingPlayerSeat, setEditingPlayerSeat] = useState<number | null>(null);
  const [showBlinds, setShowBlinds] = useState(false);
  const [showHero, setShowHero] = useState(false);
  const [showAdjustAll, setShowAdjustAll] = useState(false);
  const [showEditTable, setShowEditTable] = useState(false);

  if (!session || !players) return null;

  const activeSeats = players
    .filter((p) => !p.isAway && p.name.trim() !== "")
    .map((p) => p.seat);
  const positions = getPositionLabels(activeSeats, session.buttonSeat);

  const updatePlayer = async (seat: number, patch: Partial<Player>) => {
    const p = players.find((x) => x.seat === seat);
    if (!p || p.id === undefined) return;
    await db.players.update(p.id, patch);
  };

  const seats: SeatRenderInfo[] = players.map((p) => ({
    seat: p.seat,
    position: positions.get(p.seat) ?? "",
    name: p.name,
    stack: p.stack,
    isHero: p.isHero,
    isBTN: p.seat === session.buttonSeat,
    isCurrent: false,
    isFolded: false,
    isShown: false,
    betThisStreet: 0,
    cards: null,
    faceDown: true,
  }));

  const onTapSeat = async (seat: number) => {
    if (mode === "assignBtn") {
      if (activeSeats.includes(seat)) {
        await db.sessions.update(sessionId, { buttonSeat: seat });
      }
      setMode("default");
      return;
    }
    setEditingPlayerSeat(seat);
  };

  const moveBtn = async (dir: "cw" | "ccw") => {
    if (session.buttonSeat === null || activeSeats.length === 0) return;
    let next: number | null = session.buttonSeat;
    if (dir === "cw") {
      next = nextSeat(session.buttonSeat, session.seats, activeSeats);
    } else {
      const sorted = [...activeSeats].sort((a, b) => a - b);
      const idx = sorted.indexOf(session.buttonSeat);
      if (idx === -1) next = sorted[sorted.length - 1];
      else next = sorted[(idx - 1 + sorted.length) % sorted.length];
    }
    if (next !== null) await db.sessions.update(sessionId, { buttonSeat: next });
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
    if (activeSeats.length < 2) {
      alert("プレイヤーが2人以上必要です");
      return;
    }
    const lastFinalized = lastHand?.finalized ?? false;
    let button: number = session.buttonSeat;
    if (lastFinalized) {
      button = nextSeat(button, session.seats, activeSeats) ?? button;
    } else if (!activeSeats.includes(button)) {
      button = nextSeat(button, session.seats, activeSeats) ?? activeSeats[0];
    }
    const handNo = (lastHand?.handNo ?? 0) + 1;
    const handId = await db.hands.add({
      sessionId,
      handNo,
      startedAt: Date.now(),
      buttonSeat: button,
      sb: session.sb,
      bb: session.bb,
      ante: session.ante,
      activeSeats,
      board: { flop: null, turn: null, river: null },
      pot: 0,
      rake: 0,
      winners: [],
      wentToShowdown: false,
      note: "",
      finalized: false,
      stacksAtStart: players
        .filter((p) => p.stack !== undefined)
        .map((p) => ({ seat: p.seat, stack: p.stack as number })),
    });
    await db.sessions.update(sessionId, { buttonSeat: button });
    nav(`/sessions/${sessionId}/hands/${handId}/play`);
  };

  const heroSeatNum = session.heroSeat;
  const heroPosition = heroSeatNum !== null ? positions.get(heroSeatNum) ?? "—" : "—";

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center px-3 py-2 border-b border-neutral-800">
        <button onClick={() => nav("/dashboard")} className="text-emerald-400 text-sm">
          ‹ Dashboard
        </button>
        <div className="flex-1 text-center font-bold">Cash Setup</div>
        <button
          onClick={() => nav(`/sessions/${sessionId}/hands`)}
          className="text-neutral-300 text-xs mr-2 px-2 py-1 bg-neutral-800 rounded"
        >
          履歴
        </button>
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
          totalSeats={session.seats}
          seats={seats}
          pot={0}
          street=""
          board={[null, null, null, null, null]}
          showBoard={false}
          showPot={false}
          aspectRatio="5/4"
          onTapSeat={onTapSeat}
        />
        {mode === "assignBtn" && (
          <div className="bg-neutral-900/95 border border-neutral-800 rounded p-3 mt-2 text-center">
            <div className="text-sm font-bold">座席をタップして BTN を割り当て</div>
            <button
              onClick={() => setMode("default")}
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
            Blinds<br />
            <span className="text-base">{session.sb} / {session.bb}</span>
          </button>
          <button
            onClick={async () => {
              await db.sessions.update(sessionId, {
                autoStraddle: !session.autoStraddle,
              });
            }}
            className={`py-3 rounded font-bold text-sm ${session.autoStraddle ? "bg-emerald-700" : "bg-neutral-700"}`}
          >
            Straddle<br />
            <span className="text-base">{session.autoStraddle ? "ON" : "OFF"}</span>
          </button>
          <button
            disabled
            className="py-3 rounded bg-neutral-700 font-bold text-sm opacity-60"
          >
            Single Blind<br />
            <span className="text-base">OFF</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-xs text-neutral-400">Move BTN:</div>
          <button
            onClick={() => moveBtn("ccw")}
            className="flex-1 py-2 bg-neutral-800 rounded text-sm"
          >
            ↻ CCW
          </button>
          <button
            onClick={() => moveBtn("cw")}
            className="flex-1 py-2 bg-neutral-800 rounded text-sm"
          >
            ↺ CW
          </button>
          <button
            onClick={() => setMode("assignBtn")}
            className="flex-1 py-2 bg-neutral-800 rounded text-sm text-emerald-400"
          >
            ➤ Assign BTN
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
            Hero: <span className="text-emerald-400 font-bold">{heroPosition}</span> ▾
          </button>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded p-3 space-y-2">
          <div>
            <label>日付</label>
            <input
              type="date"
              value={session.date}
              onChange={async (e) => {
                await db.sessions.update(sessionId, { date: e.target.value });
              }}
            />
          </div>
          <div>
            <label>カジノ</label>
            <input
              value={session.casino}
              placeholder="例: Bellagio"
              onChange={async (e) => {
                await db.sessions.update(sessionId, { casino: e.target.value });
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <button
            onClick={startHand}
            className="py-4 bg-emerald-600 rounded font-bold text-lg"
          >
            Start Hand
          </button>
          <button
            onClick={() => alert("草稿として保存しました（現状は自動保存されているので無操作で OK）")}
            className="py-4 bg-rose-500 rounded font-bold text-lg"
          >
            Save Draft
          </button>
        </div>
      </div>

      {editingPlayerSeat !== null && (
        <PlayerEditSheet
          seat={editingPlayerSeat}
          player={players.find((p) => p.seat === editingPlayerSeat)!}
          bb={session.bb}
          suggestions={nameSuggestions ?? []}
          onClose={() => setEditingPlayerSeat(null)}
          onSave={async (patch) => {
            await updatePlayer(editingPlayerSeat, patch);
            setEditingPlayerSeat(null);
          }}
          onRemove={async () => {
            await updatePlayer(editingPlayerSeat, { name: "", stack: undefined });
            setEditingPlayerSeat(null);
          }}
        />
      )}

      {showBlinds && (
        <BlindsSheet
          sb={session.sb}
          bb={session.bb}
          onCancel={() => setShowBlinds(false)}
          onSave={async (sb, bb) => {
            await db.sessions.update(sessionId, { sb, bb });
            setShowBlinds(false);
          }}
        />
      )}

      {showHero && (
        <HeroPositionSheet
          activeSeats={activeSeats}
          buttonSeat={session.buttonSeat}
          currentHero={session.heroSeat}
          onCancel={() => setShowHero(false)}
          onPick={async (seat) => {
            for (const p of players) {
              if (p.id === undefined) continue;
              await db.players.update(p.id, { isHero: p.seat === seat });
            }
            await db.sessions.update(sessionId, { heroSeat: seat });
            setShowHero(false);
          }}
        />
      )}

      {showAdjustAll && (
        <AdjustAllSheet
          bb={session.bb}
          onCancel={() => setShowAdjustAll(false)}
          onApply={async (stack) => {
            for (const p of players) {
              if (p.id === undefined) continue;
              await db.players.update(p.id, { stack });
            }
            setShowAdjustAll(false);
          }}
        />
      )}

      {showEditTable && (
        <EditTableSheet
          players={players}
          buttonSeat={session.buttonSeat}
          positions={positions}
          suggestions={nameSuggestions ?? []}
          onClose={() => setShowEditTable(false)}
          onUpdatePlayer={updatePlayer}
        />
      )}
    </div>
  );
}

function PlayerEditSheet({
  seat,
  player,
  bb,
  suggestions,
  onClose,
  onSave,
  onRemove,
}: {
  seat: number;
  player: Player;
  bb: number;
  suggestions: string[];
  onClose: () => void;
  onSave: (patch: Partial<Player>) => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(player.name);
  const [stack, setStack] = useState<number | undefined>(player.stack);
  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-end" onClick={onClose}>
      <div
        className="bg-neutral-900 w-full max-w-xl mx-auto p-4 rounded-t-2xl border-t border-neutral-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-bold mb-2">S{seat} 編集</div>
        <div className="space-y-3">
          <div>
            <label>名前</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              placeholder="名前を入力"
            />
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                onClick={() => setName("Unknown")}
                className="px-3 py-1 bg-neutral-700 rounded text-xs"
              >
                Unknown
              </button>
              {suggestions.filter((s) => s && s !== "Unknown").slice(0, 10).map((s) => (
                <button
                  key={s}
                  onClick={() => setName(s)}
                  className="px-3 py-1 bg-neutral-800 rounded text-xs"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label>スタック</label>
            <StackPicker
              value={stack}
              bb={bb}
              onChange={(v) => setStack(v)}
            />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onRemove} className="flex-1 py-3 bg-rose-500 rounded font-bold">
            空席にする
          </button>
          <button
            onClick={() => onSave({ name: name.trim(), stack })}
            className="flex-1 py-3 bg-blue-500 rounded font-bold"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

function BlindsSheet({
  sb,
  bb,
  onCancel,
  onSave,
}: {
  sb: number;
  bb: number;
  onCancel: () => void;
  onSave: (sb: number, bb: number) => void;
}) {
  const [draftSb, setDraftSb] = useState(String(sb));
  const [draftBb, setDraftBb] = useState(String(bb));
  const sbPresets = [1, 2, 5, 10, 20, 50];
  const bbPresets = [2, 3, 4, 5, 10, 25];
  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-end" onClick={onCancel}>
      <div
        className="bg-neutral-900 w-full max-w-xl mx-auto p-4 rounded-t-2xl border-t border-neutral-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-bold text-center mb-3">Cash Game Stakes</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-center text-sm font-bold mb-1">Small Blind</div>
            <div className="space-y-2">
              <input
                type="number"
                inputMode="decimal"
                onFocus={(e) => e.currentTarget.select()}
                value={draftSb}
                onChange={(e) => setDraftSb(e.target.value)}
                className={`text-center font-bold border-2 ${parseFloat(draftSb) > 0 ? "border-emerald-500" : "border-transparent"}`}
              />
              {sbPresets.map((p) => (
                <button
                  key={p}
                  onClick={() => setDraftSb(String(p))}
                  className="w-full py-2 bg-neutral-800 rounded text-sm"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-center text-sm font-bold mb-1">Big Blind</div>
            <div className="space-y-2">
              <input
                type="number"
                inputMode="decimal"
                onFocus={(e) => e.currentTarget.select()}
                value={draftBb}
                onChange={(e) => setDraftBb(e.target.value)}
                className={`text-center font-bold border-2 ${parseFloat(draftBb) > 0 ? "border-emerald-500" : "border-transparent"}`}
              />
              {bbPresets.map((p) => (
                <button
                  key={p}
                  onClick={() => setDraftBb(String(p))}
                  className="w-full py-2 bg-neutral-800 rounded text-sm"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onCancel} className="flex-1 py-3 bg-neutral-800 rounded">
            Cancel
          </button>
          <button
            onClick={() => onSave(parseFloat(draftSb) || 0, parseFloat(draftBb) || 0)}
            className="flex-1 py-3 bg-blue-500 rounded font-bold"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

function HeroPositionSheet({
  activeSeats,
  buttonSeat,
  currentHero,
  onCancel,
  onPick,
}: {
  activeSeats: number[];
  buttonSeat: number | null;
  currentHero: number | null;
  onCancel: () => void;
  onPick: (seat: number) => void;
}) {
  const positions = getPositionLabels(activeSeats, buttonSeat);
  const entries = Array.from(positions.entries());
  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-end" onClick={onCancel}>
      <div
        className="bg-neutral-900 w-full max-w-xl mx-auto p-4 rounded-t-2xl border-t border-neutral-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold">Select Hero Position</div>
          <button onClick={onCancel} className="text-neutral-400">✕</button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {entries.map(([seat, label]) => (
            <button
              key={seat}
              onClick={() => onPick(seat)}
              className={`py-4 rounded font-bold text-sm ${currentHero === seat ? "bg-blue-500" : "bg-neutral-800"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function AdjustAllSheet({
  bb,
  onCancel,
  onApply,
}: {
  bb: number;
  onCancel: () => void;
  onApply: (stack: number) => void;
}) {
  const [val, setVal] = useState("");
  const presets = [50, 100, 150, 200, 300, 500];
  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-end" onClick={onCancel}>
      <div
        className="bg-neutral-900 w-full max-w-xl mx-auto p-4 rounded-t-2xl border-t border-neutral-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-bold mb-2">Adjust All Stacks</div>
        <input
          type="number"
          inputMode="decimal"
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="全プレイヤーのスタック"
          className="text-2xl font-mono"
        />
        <div className="grid grid-cols-3 gap-2 mt-2">
          {presets.map((p) => (
            <button
              key={p}
              onClick={() => setVal(String(p * bb))}
              className="py-2 bg-neutral-800 rounded text-sm"
            >
              {p}BB
            </button>
          ))}
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={onCancel} className="flex-1 py-3 bg-neutral-800 rounded">
            Cancel
          </button>
          <button
            onClick={() => onApply(parseFloat(val) || 0)}
            disabled={!val}
            className="flex-1 py-3 bg-blue-500 rounded font-bold disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

function EditTableSheet({
  players,
  buttonSeat,
  positions,
  suggestions,
  onClose,
  onUpdatePlayer,
}: {
  players: Player[];
  buttonSeat: number | null;
  positions: Map<number, string>;
  suggestions: string[];
  onClose: () => void;
  onUpdatePlayer: (seat: number, patch: Partial<Player>) => Promise<void>;
}) {
  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-end" onClick={onClose}>
      <div
        className="bg-neutral-900 w-full max-w-xl mx-auto p-4 rounded-t-2xl border-t border-neutral-800 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <button onClick={onClose} className="text-rose-400 text-lg">✕</button>
          <div className="text-sm font-bold">Edit Poker Table</div>
          <div className="w-8" />
        </div>
        <div className="text-center text-xs text-neutral-400 mb-3">
          NOTE: Seats move clockwise from hero
        </div>
        <div className="grid grid-cols-[80px_50px_1fr_60px] gap-2 text-xs text-neutral-400 border-b border-neutral-800 pb-1 mb-2">
          <div>Stack</div>
          <div>Pos</div>
          <div>Name</div>
          <div className="text-center">Sit in</div>
        </div>
        {players.map((p) => {
          const pos = positions.get(p.seat) ?? "";
          const isBtn = p.seat === buttonSeat;
          return (
            <div
              key={p.seat}
              className="grid grid-cols-[80px_50px_1fr_60px] gap-2 items-center py-2 border-b border-neutral-800"
            >
              <input
                type="number"
                inputMode="decimal"
                onFocus={(e) => e.currentTarget.select()}
                value={p.stack ?? ""}
                placeholder="0"
                onChange={(e) =>
                  onUpdatePlayer(p.seat, {
                    stack: e.target.value === "" ? undefined : parseFloat(e.target.value) || 0,
                  })
                }
                className="text-sm py-1"
              />
              <div className="text-sm font-bold">
                {isBtn ? "BTN" : pos || "—"}
              </div>
              <NamePicker
                value={p.name}
                suggestions={suggestions}
                onChange={(name) => onUpdatePlayer(p.seat, { name })}
                className="text-left text-sm bg-neutral-800 rounded px-2 py-1.5"
              />
              <button
                onClick={() =>
                  onUpdatePlayer(p.seat, { isAway: !p.isAway })
                }
                className={`mx-auto block w-10 h-6 rounded-full ${!p.isAway ? "bg-emerald-500" : "bg-neutral-700"}`}
              >
                <span className={`block w-5 h-5 bg-white rounded-full transition-transform ${!p.isAway ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </div>
          );
        })}
        <div className="text-center text-sm mt-3">
          Current # Seats: {players.length}
        </div>
      </div>
    </div>
  );
}
