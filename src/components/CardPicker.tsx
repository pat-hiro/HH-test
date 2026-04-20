import { useState } from "react";
import { RANKS, SUITS, suitColor, suitSymbol } from "../utils/cards";

export default function CardPicker({
  value,
  onChange,
  exclude = [],
  label,
  size = "md",
}: {
  value: string | null;
  onChange: (c: string | null) => void;
  exclude?: string[];
  label?: string;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);

  const pick = (card: string) => {
    onChange(card);
    setOpen(false);
  };

  const faceSize =
    size === "sm" ? "w-10 h-14 text-base" : "w-12 h-16 text-lg";

  return (
    <div className="inline-block">
      {label && <div className="text-xs text-neutral-400 mb-1">{label}</div>}
      <button
        onClick={() => setOpen(true)}
        className={`${faceSize} border border-neutral-700 rounded bg-neutral-900 flex items-center justify-center font-mono`}
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
            <div className="flex justify-between items-center mb-3">
              <div className="text-sm text-neutral-400">カード選択</div>
              <div className="flex gap-2">
                {value && (
                  <button
                    onClick={() => {
                      onChange(null);
                      setOpen(false);
                    }}
                    className="text-xs text-red-400 px-2 py-1"
                  >
                    クリア
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="text-xs text-neutral-400 px-2 py-1"
                >
                  閉じる
                </button>
              </div>
            </div>
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}
            >
              {SUITS.map((s) =>
                RANKS.map((r) => {
                  const card = `${r}${s}`;
                  const disabled = exclude.includes(card) && card !== value;
                  const selected = card === value;
                  return (
                    <button
                      key={card}
                      disabled={disabled}
                      onClick={() => pick(card)}
                      className={`aspect-[3/4] rounded flex flex-col items-center justify-center font-mono leading-none ${
                        disabled
                          ? "opacity-20 bg-neutral-800"
                          : selected
                            ? "bg-felt-700 border border-felt-700"
                            : "bg-neutral-800"
                      } ${suitColor(s)}`}
                    >
                      <span className="font-bold text-[13px]">{r}</span>
                      <span className="text-[13px]">{suitSymbol(s)}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
