import { useState } from "react";

export default function NamePicker({
  value,
  suggestions,
  onChange,
  className = "",
}: {
  value: string;
  suggestions: string[];
  onChange: (name: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const openSheet = () => {
    setDraft(value);
    setOpen(true);
  };

  const commit = (n: string) => {
    onChange(n);
    setOpen(false);
  };

  const pastNames = suggestions
    .filter((s) => s && s !== "Unknown")
    .slice(0, 20);

  return (
    <>
      <button onClick={openSheet} className={className}>
        {value || <span className="text-neutral-500">（空席）</span>}
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
            <div className="text-sm text-neutral-400 mb-2">プレイヤー名</div>
            <input
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="名前を入力"
            />
            <div className="mt-3">
              <button
                onClick={() => commit("Unknown")}
                className="w-full py-2 bg-neutral-700 rounded text-sm font-semibold"
              >
                Unknown（1タップ）
              </button>
            </div>
            {pastNames.length > 0 && (
              <div className="mt-3">
                <div className="text-xs text-neutral-500 mb-1">過去のプレイヤー</div>
                <div className="flex flex-wrap gap-2">
                  {pastNames.map((s) => (
                    <button
                      key={s}
                      onClick={() => commit(s)}
                      className="px-3 py-1 bg-neutral-800 rounded text-sm"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => commit("")}
                className="flex-1 py-3 bg-neutral-800 rounded"
              >
                クリア（空席扱い）
              </button>
              <button
                onClick={() => commit(draft.trim())}
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
