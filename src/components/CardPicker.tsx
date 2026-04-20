import { useState } from "react";
import { RANKS, SUITS, suitColor, suitSymbol } from "../utils/cards";

export default function CardPicker({
  value,
  onChange,
  exclude = [],
  label,
}: {
  value: string | null;
  onChange: (c: string | null) => void;
  exclude?: string[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [rank, setRank] = useState<string | null>(value?.[0] ?? null);

  const pick = (r: string, s: string) => {
    const card = `${r}${s}`;
    onChange(card);
    setRank(null);
    setOpen(false);
  };

  return (
    <div className="inline-block">
      {label && <div className="text-xs text-neutral-400 mb-1">{label}</div>}
      <button
        onClick={() => setOpen(true)}
        className="w-14 h-20 border border-neutral-700 rounded bg-neutral-900 flex items-center justify-center font-mono text-xl"
      >
        {value ? (
          <span className={suitColor(value[1])}>
            {value[0]}
            {suitSymbol(value[1])}
          </span>
        ) : (
          <span className="text-neutral-600">？</span>
        )}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/70 flex items-end"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-neutral-900 w-full p-3 rounded-t-xl border-t border-neutral-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-2">
              <div className="text-sm text-neutral-400">
                {rank ? "スートを選択" : "ランクを選択"}
              </div>
              {value && (
                <button
                  onClick={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  className="text-xs text-red-400"
                >
                  クリア
                </button>
              )}
            </div>
            {!rank && (
              <div className="grid grid-cols-7 gap-2">
                {RANKS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRank(r)}
                    className="py-3 bg-neutral-800 rounded font-mono text-lg"
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
            {rank && (
              <div className="grid grid-cols-4 gap-2">
                {SUITS.map((s) => {
                  const card = `${rank}${s}`;
                  const disabled = exclude.includes(card);
                  return (
                    <button
                      key={s}
                      disabled={disabled}
                      onClick={() => pick(rank, s)}
                      className={`py-4 rounded font-mono text-2xl ${
                        disabled
                          ? "bg-neutral-800 opacity-30"
                          : "bg-neutral-800"
                      } ${suitColor(s)}`}
                    >
                      {rank}
                      {suitSymbol(s)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
