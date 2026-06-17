import { useState } from "react";
import { RANKS, SUITS, suitSymbol } from "../cards";
import PlayingCard from "./PlayingCard";

/**
 * GTOW-inspired board picker. Layout:
 *   ┌─────────────────────────────────────────────┐
 *   │ [F1][F2][F3] [T] [R]    🗑  ⟲                │  <- slot strip + actions
 *   ├─────────────────────────────────────────────┤
 *   │ ♠  A K Q J T 9 8 7 6 5 4 3 2                 │
 *   │ ♥  A K Q J T 9 8 7 6 5 4 3 2                 │
 *   │ ♦  A K Q J T 9 8 7 6 5 4 3 2                 │
 *   │ ♣  A K Q J T 9 8 7 6 5 4 3 2                 │
 *   └─────────────────────────────────────────────┘
 *
 * Designed to be readable at table dimensions; original colors (so we don't
 * collide with GTOW's exact palette but the spatial structure carries over).
 *
 * Partial entry is allowed: Confirm always saves whatever is filled in the
 * slots, including all-empty. The hand screen tracks "prompted-once" per
 * street so a user who skipped on purpose isn't re-prompted, but a tap on a
 * board slot brings the sheet right back.
 */
export default function BoardCardSheet({
  initialBoard,
  startSlot,
  hero,
  exclude,
  onSubmit,
  onCancel,
  onClear,
}: {
  initialBoard: (string | null)[];
  startSlot: number;
  hero?: [string, string] | null;
  exclude: string[];
  onSubmit: (board: (string | null)[]) => void;
  onCancel: () => void;
  onClear: () => void;
  /** kept for backward compat — partial entry is always allowed now */
  requiredSlots?: number[];
  blocking?: boolean;
}) {
  const [slots, setSlots] = useState<(string | null)[]>([...initialBoard]);
  const [active, setActive] = useState(startSlot);

  const used = new Set<string>(exclude);
  for (const c of slots) if (c) used.add(c);
  if (hero) {
    used.add(hero[0]);
    used.add(hero[1]);
  }

  const pick = (card: string) => {
    const next = [...slots];
    if (next[active] === card) {
      // tap the already-selected card to clear that slot
      next[active] = null;
    } else {
      next[active] = card;
    }
    setSlots(next);
    // auto-advance to next empty slot
    const nxt = next.findIndex((c, i) => i > active && c === null);
    if (nxt !== -1 && next[active] !== null) setActive(nxt);
  };

  const clearActive = () => {
    const next = [...slots];
    next[active] = null;
    setSlots(next);
  };

  const slotLabels = ["F1", "F2", "F3", "T", "R"];

  // suit row colors — original palette, not GTOW's, but spatially familiar
  const rowBg: Record<string, string> = {
    s: "bg-neutral-700/60",
    h: "bg-rose-900/60",
    d: "bg-blue-900/60",
    c: "bg-emerald-900/60",
  };
  const cellBg: Record<string, string> = {
    s: "bg-neutral-800",
    h: "bg-rose-800",
    d: "bg-blue-800",
    c: "bg-emerald-800",
  };
  const cellBgUsed: Record<string, string> = {
    s: "bg-neutral-900/40",
    h: "bg-rose-950/40",
    d: "bg-blue-950/40",
    c: "bg-emerald-950/40",
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end" onClick={onCancel}>
      <div
        className="bg-neutral-900 w-full max-w-xl mx-auto rounded-t-2xl border-t border-neutral-800 safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Slot strip + actions */}
        <div className="flex items-start justify-between p-3 border-b border-neutral-800">
          <div className="flex flex-col gap-1">
            <div className="flex gap-1">
              {slots.map((c, i) => (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  className={`rounded ${active === i ? "ring-2 ring-emerald-400" : ""}`}
                >
                  <PlayingCard card={c} size="md" faceDown={!c} />
                </button>
              ))}
            </div>
            <div className="flex gap-1 mt-0.5">
              {slotLabels.map((l, i) => (
                <div
                  key={i}
                  className={`w-10 text-center text-[10px] leading-none ${active === i ? "text-emerald-300" : "text-neutral-500"}`}
                >
                  {l}
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5 ml-2">
            <button
              onClick={clearActive}
              title="現在のスロットをクリア"
              className="w-11 h-9 bg-neutral-800 rounded flex items-center justify-center text-base"
            >
              🗑
            </button>
            <button
              onClick={onClear}
              title="ボード全消去"
              className="w-11 h-9 bg-neutral-800 rounded flex items-center justify-center text-base"
            >
              ⟲
            </button>
            <button
              onClick={() => onSubmit(slots)}
              className="w-11 h-9 bg-emerald-600 rounded text-xs font-bold"
            >
              OK
            </button>
          </div>
        </div>

        {/* 4 rows × 13 cards */}
        <div className="p-2 space-y-1">
          {SUITS.map((s) => (
            <div
              key={s}
              className={`grid grid-cols-13 gap-1 px-1.5 py-1 rounded ${rowBg[s]}`}
              style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}
            >
              {RANKS.map((r) => {
                const card = `${r}${s}`;
                const isUsed = used.has(card) && slots[active] !== card;
                const isSelected = slots[active] === card;
                return (
                  <button
                    key={card}
                    disabled={isUsed}
                    onClick={() => pick(card)}
                    className={`relative aspect-[3/4] rounded flex flex-col items-center justify-center text-white font-bold leading-none ${
                      isSelected
                        ? "ring-2 ring-yellow-300 " + cellBg[s]
                        : isUsed
                          ? cellBgUsed[s] + " opacity-40"
                          : cellBg[s]
                    }`}
                  >
                    <span className="text-base">{r}</span>
                    <span className="absolute bottom-0 right-0.5 text-[10px] opacity-80">
                      {suitSymbol(s)}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="px-3 pb-2 text-[10px] text-neutral-500">
          覚えていない箇所は空欄のままで OK。あとから卓上のカードをタップして埋められます。
        </div>
      </div>
    </div>
  );
}
