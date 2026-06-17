import { useState } from "react";
import type { BetPreset } from "../../data/types-presets";
import { computePresetAmount } from "../../engine/presets";
import type { PresetCtx } from "../../engine/presets";

export default function BetSizeSheet({
  kind,
  presets,
  ctx,
  min,
  initial,
  onCancel,
  onSubmit,
}: {
  kind: "bet" | "raise" | "allin";
  presets: BetPreset[];
  ctx: PresetCtx;
  min: number;
  initial?: number;
  onCancel: () => void;
  onSubmit: (amount: number) => void;
}) {
  const [draft, setDraft] = useState(String(initial ?? min ?? ""));
  const num = parseFloat(draft) || 0;
  const valid = num >= min;
  const title = kind === "raise" ? "Raise to" : kind === "bet" ? "Bet" : "All-in";

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-end" onClick={onCancel}>
      <div
        className="bg-neutral-900 w-full max-w-xl mx-auto p-4 rounded-t-2xl border-t border-neutral-800 safe-bottom max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm text-neutral-400 mb-2">{title}</div>
        {kind !== "allin" && presets.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-3">
            {presets.map((p, i) => {
              const v = computePresetAmount(p, ctx);
              return (
                <button
                  key={`${p.label}-${i}`}
                  onClick={() => setDraft(String(v))}
                  className="py-2 bg-blue-500 rounded text-sm font-bold leading-tight"
                >
                  <div>{p.label}</div>
                  <div className="text-xs text-blue-100">{v}</div>
                </button>
              );
            })}
          </div>
        )}
        <input
          type="number"
          inputMode="decimal"
          onFocus={(e) => e.currentTarget.select()}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="text-2xl font-mono"
          autoFocus
        />
        <div className="text-[11px] text-neutral-500 mt-1">最低 {min}</div>
        <div className="flex gap-2 mt-3">
          <button onClick={onCancel} className="flex-1 py-3 bg-neutral-800 rounded">
            Cancel
          </button>
          <button
            onClick={() => onSubmit(num)}
            disabled={!valid}
            className="flex-1 py-3 bg-emerald-600 rounded font-bold disabled:opacity-40"
          >
            {title === "Raise to" ? "Raise" : title} {num || ""}
          </button>
        </div>
      </div>
    </div>
  );
}
