import { useState } from "react";

export default function StackPicker({
  value,
  bb,
  onChange,
}: {
  value: number | undefined;
  bb: number;
  onChange: (v: number | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string>(value === undefined ? "" : String(value));

  const presets = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500];

  const openSheet = () => {
    setDraft(value === undefined ? "" : String(value));
    setOpen(true);
  };

  const commit = () => {
    const n = draft === "" ? undefined : parseFloat(draft);
    onChange(n === undefined || Number.isNaN(n) ? undefined : n);
    setOpen(false);
  };

  const clear = () => {
    onChange(undefined);
    setOpen(false);
  };

  const bbEquiv =
    bb > 0 && draft !== ""
      ? (parseFloat(draft) / bb).toFixed(1)
      : null;

  return (
    <>
      <button
        onClick={openSheet}
        className="w-28 py-2 px-2 rounded bg-neutral-900 border border-neutral-700 text-right font-mono text-sm"
      >
        {value === undefined ? (
          <span className="text-neutral-500">Stack</span>
        ) : (
          <>
            {value}
            {bb > 0 && (
              <span className="text-neutral-500 text-[10px] ml-1">
                {(value / bb).toFixed(0)}bb
              </span>
            )}
          </>
        )}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/70 flex items-end"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-neutral-900 w-full max-w-xl mx-auto p-4 rounded-t-xl border-t border-neutral-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm text-neutral-400 mb-2">スタック</div>
            <input
              type="number"
              inputMode="decimal"
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="金額を入力"
              className="text-2xl font-mono"
            />
            <div className="text-xs text-neutral-500 mt-1 h-4">
              {bbEquiv ? `${bbEquiv} BB` : ""}
            </div>
            <div className="grid grid-cols-5 gap-2 mt-3 text-sm">
              {presets.map((n) => (
                <button
                  key={n}
                  onClick={() => setDraft(String(n * bb))}
                  className="py-2 bg-neutral-800 rounded"
                >
                  {n}BB
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={clear} className="flex-1 py-3 bg-neutral-800 rounded">
                クリア
              </button>
              <button
                onClick={commit}
                className="flex-1 py-3 bg-felt-700 rounded font-bold"
              >
                確定
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
