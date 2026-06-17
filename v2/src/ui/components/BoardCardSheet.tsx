import { useState } from "react";
import { RANKS, SUITS, suitSymbol } from "../cards";
import PlayingCard from "./PlayingCard";

export default function BoardCardSheet({
  initialBoard,
  startSlot,
  hero,
  exclude,
  onSubmit,
  onCancel,
  onClear,
  /** Slots whose cards must be filled before Confirm is enabled. The hand
   * screen passes the indices required for the current street (e.g. [0,1,2]
   * for flop, [3] for turn, [4] for river). When omitted, Confirm is always
   * enabled (used by the manual board-edit flow during a finished hand). */
  requiredSlots,
  /** When true, the user cannot dismiss the sheet without filling the
   * required slots. Hides the X tap-outside behavior. */
  blocking = false,
}: {
  initialBoard: (string | null)[];
  startSlot: number;
  hero?: [string, string] | null;
  exclude: string[];
  onSubmit: (board: (string | null)[]) => void;
  onCancel: () => void;
  onClear: () => void;
  requiredSlots?: number[];
  blocking?: boolean;
}) {
  const [slots, setSlots] = useState<(string | null)[]>([...initialBoard]);
  const [active, setActive] = useState(startSlot);
  const valid =
    requiredSlots === undefined
      ? true
      : requiredSlots.every((i) => slots[i] !== null);

  const used = new Set<string>(exclude);
  for (const c of slots) if (c) used.add(c);
  if (hero) {
    used.add(hero[0]);
    used.add(hero[1]);
  }

  const pick = (card: string) => {
    const next = [...slots];
    next[active] = card;
    setSlots(next);
    const nxt = next.findIndex((c, i) => i > active && c === null);
    if (nxt !== -1) setActive(nxt);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-end"
      onClick={blocking ? undefined : onCancel}
    >
      <div
        className="bg-neutral-900 w-full max-w-xl mx-auto rounded-t-2xl border-t border-neutral-800 safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-3 border-b border-neutral-800">
          <div className="flex gap-1">
            {slots.map((c, i) => {
              const required = requiredSlots?.includes(i) ?? false;
              const missing = required && c === null;
              return (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  className={`rounded ${active === i ? "ring-2 ring-emerald-400" : missing ? "ring-2 ring-rose-500" : ""}`}
                >
                  <PlayingCard card={c} size="md" faceDown={!c} />
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => valid && onSubmit(slots)}
              disabled={!valid}
              className="px-4 py-1.5 bg-blue-500 rounded text-sm font-bold disabled:opacity-40"
            >
              Confirm
            </button>
            <button onClick={onClear} className="px-4 py-1.5 bg-rose-500 rounded text-sm font-bold">
              Clear
            </button>
          </div>
        </div>
        {blocking && !valid && (
          <div className="px-3 py-1 text-[11px] text-rose-300 bg-rose-900/30 border-b border-rose-900/40">
            このストリートに進むには赤枠のカードを全部入れてください
          </div>
        )}
        <div className="p-3 grid grid-cols-2 gap-3">
          {SUITS.map((s) => (
            <div key={s} className="grid grid-cols-5 gap-1">
              {RANKS.slice().reverse().map((r) => {
                const card = `${r}${s}`;
                const isUsed = used.has(card) && slots[active] !== card;
                const selected = slots[active] === card;
                const isRed = s === "h" || s === "d";
                return (
                  <button
                    key={card}
                    disabled={isUsed && !selected}
                    onClick={() => pick(card)}
                    className={`aspect-[3/4] rounded font-bold flex flex-col items-center justify-center leading-none ${
                      isUsed && !selected
                        ? "bg-neutral-700 opacity-30"
                        : selected
                          ? "bg-emerald-700 text-white"
                          : "bg-white"
                    } ${selected ? "" : isRed ? "text-rose-500" : "text-neutral-900"}`}
                  >
                    <span className="text-[13px]">{r}</span>
                    <span className="text-[13px]">{suitSymbol(s)}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
