import { useState } from "react";

export default function AmountInput({
  unitAmount,
  unitLabel,
  pot,
  toCall,
  min,
  onSubmit,
  onCancel,
  label,
}: {
  unitAmount: number;
  unitLabel: string;
  pot: number;
  toCall: number;
  min: number;
  onSubmit: (amount: number) => void;
  onCancel: () => void;
  label: string;
}) {
  const [value, setValue] = useState<string>(String(min || ""));
  const num = parseFloat(value) || 0;

  const preset = (mult: number, basis: "pot" | "unit" | "call") => {
    let v: number;
    if (basis === "pot") v = pot * mult;
    else if (basis === "unit") v = unitAmount * mult;
    else v = toCall * mult;
    v = Math.round(v * 100) / 100;
    setValue(String(v));
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-black/70 flex items-end"
      onClick={onCancel}
    >
      <div
        className="bg-neutral-900 w-full max-w-xl mx-auto p-4 rounded-t-xl border-t border-neutral-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm text-neutral-400 mb-2">{label}</div>
        <input
          type="number"
          onFocus={(e) => e.currentTarget.select()}
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="text-2xl font-mono"
          autoFocus
        />
        <div className="grid grid-cols-4 gap-2 mt-3 text-sm">
          <button onClick={() => preset(2, "unit")} className="py-2 bg-neutral-800 rounded">
            2{unitLabel}
          </button>
          <button onClick={() => preset(2.5, "unit")} className="py-2 bg-neutral-800 rounded">
            2.5{unitLabel}
          </button>
          <button onClick={() => preset(3, "unit")} className="py-2 bg-neutral-800 rounded">
            3{unitLabel}
          </button>
          <button onClick={() => preset(4, "unit")} className="py-2 bg-neutral-800 rounded">
            4{unitLabel}
          </button>
          <button onClick={() => preset(0.33, "pot")} className="py-2 bg-neutral-800 rounded">
            1/3 pot
          </button>
          <button onClick={() => preset(0.5, "pot")} className="py-2 bg-neutral-800 rounded">
            1/2 pot
          </button>
          <button onClick={() => preset(0.66, "pot")} className="py-2 bg-neutral-800 rounded">
            2/3 pot
          </button>
          <button onClick={() => preset(1, "pot")} className="py-2 bg-neutral-800 rounded">
            POT
          </button>
          {toCall > 0 && (
            <>
              <button onClick={() => preset(2.5, "call")} className="py-2 bg-neutral-800 rounded">
                ×2.5
              </button>
              <button onClick={() => preset(3, "call")} className="py-2 bg-neutral-800 rounded">
                ×3
              </button>
              <button onClick={() => preset(4, "call")} className="py-2 bg-neutral-800 rounded">
                ×4
              </button>
            </>
          )}
        </div>
        <div className="flex gap-2 mt-4">
          <button
            onClick={onCancel}
            className="flex-1 py-3 bg-neutral-800 rounded"
          >
            キャンセル
          </button>
          <button
            onClick={() => onSubmit(num)}
            disabled={num < min}
            className="flex-1 py-3 bg-felt-700 rounded font-bold disabled:opacity-40"
          >
            確定 {num}
          </button>
        </div>
      </div>
    </div>
  );
}
