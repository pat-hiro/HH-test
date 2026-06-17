import { useState } from "react";
import { RANKS, SUITS, suitSymbol } from "../cards";
import PlayingCard from "./PlayingCard";

/**
 * Generic N-slot card picker bottom sheet. Used for Hero hole cards and for
 * villain shown cards at showdown. (Board uses its own sheet because of the
 * pot/confirm layout.)
 */
export default function CardPickerSheet({
  title,
  count,
  initial,
  exclude,
  onSubmit,
  onCancel,
}: {
  title: string;
  count: number;
  initial: (string | null)[];
  exclude: string[];
  onSubmit: (cards: (string | null)[]) => void;
  onCancel: () => void;
}) {
  const padded = Array.from({ length: count }, (_, i) => initial[i] ?? null);
  const [slots, setSlots] = useState<(string | null)[]>(padded);
  const [active, setActive] = useState(0);

  const used = new Set<string>(exclude);
  for (const c of slots) if (c) used.add(c);

  const pick = (card: string) => {
    const next = [...slots];
    next[active] = card;
    setSlots(next);
    const nxt = next.findIndex((c, i) => i > active && c === null);
    if (nxt !== -1) setActive(nxt);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end" onClick={onCancel}>
      <div
        className="bg-neutral-900 w-full max-w-xl mx-auto rounded-t-2xl border-t border-neutral-800 safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-3 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <div className="text-sm font-bold">{title}</div>
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
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => onSubmit(slots)}
              className="px-4 py-1.5 bg-blue-500 rounded text-sm font-bold"
            >
              Confirm
            </button>
            <button
              onClick={() => onSubmit(Array.from({ length: count }, () => null))}
              className="px-4 py-1.5 bg-rose-500 rounded text-sm font-bold"
            >
              Clear
            </button>
          </div>
        </div>
        <div className="p-3 grid grid-cols-2 gap-3">
          {SUITS.map((s) => (
            <div key={s} className="grid grid-cols-5 gap-1">
              {RANKS.slice()
                .reverse()
                .map((r) => {
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
