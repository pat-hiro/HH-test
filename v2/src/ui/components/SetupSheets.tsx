import { useState } from "react";
import type { SessionPlayer } from "../../data/types";
import NamePicker from "./NamePicker";
import StackPicker from "./StackPicker";

// ---------------------------------------------------------------------------
// AnteSheet — BB Ante amount (default 1BB), as BB-multiple presets + custom
// ---------------------------------------------------------------------------

export function AnteSheet({
  ante,
  bb,
  onCancel,
  onSave,
}: {
  ante: number;
  bb: number;
  onCancel: () => void;
  onSave: (ante: number) => void;
}) {
  const [draft, setDraft] = useState(String(ante));
  const presets = [
    { label: "OFF", value: 0 },
    { label: "0.5BB", value: bb * 0.5 },
    { label: "1BB", value: bb },
    { label: "1.5BB", value: bb * 1.5 },
    { label: "2BB", value: bb * 2 },
  ];
  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-end" onClick={onCancel}>
      <div
        className="bg-neutral-900 w-full max-w-xl mx-auto p-4 rounded-t-2xl border-t border-neutral-800 safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-bold mb-1">BB Ante</div>
        <div className="text-[11px] text-neutral-500 mb-3">
          BBが支払う共通アンティ（デッド）。デフォルトは1BB。
        </div>
        <div className="grid grid-cols-5 gap-2 mb-3">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => setDraft(String(p.value))}
              className={`py-2 rounded text-sm ${
                (parseFloat(draft) || 0) === p.value ? "bg-blue-500" : "bg-neutral-800"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label>金額（カスタム）</label>
        <input
          type="number"
          inputMode="decimal"
          onFocus={(e) => e.currentTarget.select()}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="flex gap-2 mt-4">
          <button onClick={onCancel} className="flex-1 py-3 bg-neutral-800 rounded">
            Cancel
          </button>
          <button
            onClick={() => onSave(parseFloat(draft) || 0)}
            className="flex-1 py-3 bg-blue-500 rounded font-bold"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BlindsSheet — two-column SB/BB preset picker + custom input
// ---------------------------------------------------------------------------

export function BlindsSheet({
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
  const sbPresets = [1, 2, 5, 10, 25, 50];
  const bbPresets = [2, 3, 4, 5, 10, 25];

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-end" onClick={onCancel}>
      <div
        className="bg-neutral-900 w-full max-w-xl mx-auto p-4 rounded-t-2xl border-t border-neutral-800 safe-bottom max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-bold text-center mb-3">Cash Game Stakes</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-center text-sm font-bold mb-1">Small Blind</div>
            <input
              type="number"
              inputMode="decimal"
              onFocus={(e) => e.currentTarget.select()}
              value={draftSb}
              onChange={(e) => setDraftSb(e.target.value)}
              className="text-center font-bold"
            />
            <div className="space-y-2 mt-2">
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
            <input
              type="number"
              inputMode="decimal"
              onFocus={(e) => e.currentTarget.select()}
              value={draftBb}
              onChange={(e) => setDraftBb(e.target.value)}
              className="text-center font-bold"
            />
            <div className="space-y-2 mt-2">
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

// ---------------------------------------------------------------------------
// PlayerEditSheet — tap a seat to edit its name, stack, sit-out, post flags
// ---------------------------------------------------------------------------

type PostMode = "none" | "bb" | "bb_ante";

type EntryMode = "wait" | "post" | "post_ante" | "free";

export function PlayerEditSheet({
  seat,
  player,
  bb,
  ante,
  suggestions,
  seatingMode = false,
  onClose,
  onSave,
  onSitOut,
}: {
  seat: number;
  player: SessionPlayer;
  bb: number;
  /** configured BB-ante in chips; drives the "1BB + ante" post label */
  ante: number;
  suggestions: string[];
  /** when a NEW player sits down mid-session: show how-they-enter choices
   *  (wait for BB / post / free) instead of the returning-player post toggle */
  seatingMode?: boolean;
  onClose: () => void;
  onSave: (patch: Partial<SessionPlayer>) => void;
  onSitOut: () => void;
}) {
  const [name, setName] = useState(player.name);
  const [stack, setStack] = useState<number | null>(player.stack);
  const initialPost: PostMode = player.mustPostBB
    ? player.postWithAnte
      ? "bb_ante"
      : "bb"
    : "none";
  const [postMode, setPostMode] = useState<PostMode>(initialPost);
  // Mid-session newcomers default to waiting for the big blind (casino norm:
  // you don't get a hand until the BB reaches you unless you post or it's a
  // free table-change hand).
  const [entry, setEntry] = useState<EntryMode>("wait");

  const seatingPatch = (): Partial<SessionPlayer> => {
    switch (entry) {
      case "post":
        return { mustPostBB: true, postWithAnte: false, waitingForBB: false, isAway: false };
      case "post_ante":
        return { mustPostBB: true, postWithAnte: true, waitingForBB: false, isAway: false };
      case "free":
        return { mustPostBB: false, postWithAnte: false, waitingForBB: false, isAway: false };
      case "wait":
      default:
        return { mustPostBB: false, postWithAnte: false, waitingForBB: true, isAway: false };
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-end" onClick={onClose}>
      <div
        className="bg-neutral-900 w-full max-w-xl mx-auto p-4 rounded-t-2xl border-t border-neutral-800 safe-bottom max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-bold mb-2">S{seat} 編集</div>

        <div className="space-y-3">
          <div>
            <label>名前</label>
            <NamePicker
              value={name}
              suggestions={suggestions}
              onChange={(v) => setName(v)}
              className="block w-full text-left py-2 px-2 bg-neutral-900 border border-neutral-700 rounded"
            />
          </div>
          <div>
            <label>スタック</label>
            <StackPicker value={stack} bb={bb} onChange={(v) => setStack(v)} />
          </div>
          {seatingMode ? (
            <div>
              <div className="text-xs text-neutral-400 mb-1">参加方法</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setEntry("wait")}
                  className={`py-2 rounded text-sm ${entry === "wait" ? "bg-blue-500" : "bg-neutral-800"}`}
                >
                  BBを待つ
                </button>
                <button
                  onClick={() => setEntry("free")}
                  className={`py-2 rounded text-sm ${entry === "free" ? "bg-blue-500" : "bg-neutral-800"}`}
                >
                  フリー参加
                </button>
                <button
                  onClick={() => setEntry("post")}
                  className={`py-2 rounded text-sm ${entry === "post" ? "bg-blue-500" : "bg-neutral-800"}`}
                >
                  ポスト 1BB
                </button>
                <button
                  onClick={() => setEntry("post_ante")}
                  disabled={ante <= 0}
                  className={`py-2 rounded text-sm ${
                    entry === "post_ante" ? "bg-blue-500" : "bg-neutral-800"
                  } disabled:opacity-40`}
                  title={ante <= 0 ? "BBアンテ未設定" : ""}
                >
                  {ante > 0 ? `ポスト 1BB+${ante}` : "ポスト 1BB+ante"}
                </button>
              </div>
              <div className="text-[10px] text-neutral-500 mt-1.5">
                {entry === "wait"
                  ? "BBがこの席に来たハンドから参加します（それまで待機）。"
                  : entry === "free"
                    ? "次ハンドからポストなしで参加（テーブルチェンジ等）。"
                    : "次ハンドにポストして参加します。"}
              </div>
            </div>
          ) : (
            <div>
              <div className="text-xs text-neutral-400 mb-1">
                Post（復帰時に次ハンドで支払う）
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setPostMode("none")}
                  className={`py-2 rounded text-sm ${postMode === "none" ? "bg-blue-500" : "bg-neutral-800"}`}
                >
                  なし
                </button>
                <button
                  onClick={() => setPostMode("bb")}
                  className={`py-2 rounded text-sm ${postMode === "bb" ? "bg-blue-500" : "bg-neutral-800"}`}
                >
                  1BB
                </button>
                <button
                  onClick={() => setPostMode("bb_ante")}
                  disabled={ante <= 0}
                  className={`py-2 rounded text-sm ${
                    postMode === "bb_ante" ? "bg-blue-500" : "bg-neutral-800"
                  } disabled:opacity-40`}
                  title={ante <= 0 ? "BBアンテ未設定" : ""}
                >
                  {ante > 0 ? `1BB + ${ante}（ante）` : "1BB + ante"}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-4">
          {!seatingMode && (
            <button
              onClick={onSitOut}
              className={`flex-1 py-3 rounded font-bold ${player.isAway ? "bg-amber-700" : "bg-amber-600"}`}
            >
              {player.isAway ? "復帰" : "Sit Out"}
            </button>
          )}
          <button
            onClick={() =>
              onSave(
                seatingMode
                  ? { name: name.trim(), stack, ...seatingPatch() }
                  : {
                      name: name.trim(),
                      stack,
                      mustPostBB: postMode !== "none",
                      postWithAnte: postMode === "bb_ante",
                    }
              )
            }
            className="flex-1 py-3 bg-blue-500 rounded font-bold"
          >
            {seatingMode ? "着席" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AdjustAllSheet — set every player's stack to one value
// ---------------------------------------------------------------------------

export function AdjustAllSheet({
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
        className="bg-neutral-900 w-full max-w-xl mx-auto p-4 rounded-t-2xl border-t border-neutral-800 safe-bottom"
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

// ---------------------------------------------------------------------------
// EditTableSheet — bulk editor: list every seat with stack/pos/name/sit-in,
// add/remove seat (2..11)
// ---------------------------------------------------------------------------

export function EditTableSheet({
  players,
  buttonSeat,
  seatCount,
  positions,
  suggestions,
  onClose,
  onUpdate,
  onEmpty,
  onSwap,
  onAddSeat,
  onRemoveLastSeat,
}: {
  players: SessionPlayer[];
  buttonSeat: number | null;
  /** total seats configured on the session (controls add/remove bounds 2..11) */
  seatCount: number;
  positions: Map<number, string>;
  suggestions: string[];
  onClose: () => void;
  onUpdate: (seat: number, patch: Partial<SessionPlayer>) => Promise<void>;
  /** Reset a seat to empty (name="", stack=null, Sit-out cleared). The seat
   *  slot itself stays — empty chairs around a cardroom table that can be
   *  filled when a new player arrives. */
  onEmpty: (seat: number) => Promise<void>;
  /** Swap every per-player field (name, stack, Hero, post flags, etc.) between
   *  two seats so a player can move chairs without losing their state. */
  onSwap: (seatA: number, seatB: number) => Promise<void>;
  /** Bump seatCount by 1 (up to 11) and create a new empty SessionPlayer at
   *  the new tail seat. */
  onAddSeat: () => Promise<void>;
  /** Drop the highest-numbered seat (down to 2). Only allowed if it's empty. */
  onRemoveLastSeat: () => Promise<void>;
}) {
  const [swapFrom, setSwapFrom] = useState<number | null>(null);
  const tapRow = async (seat: number) => {
    if (swapFrom === null) return;
    if (swapFrom !== seat) await onSwap(swapFrom, seat);
    setSwapFrom(null);
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-end" onClick={onClose}>
      <div
        className="bg-neutral-900 w-full max-w-xl mx-auto p-4 rounded-t-2xl border-t border-neutral-800 safe-bottom max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <button onClick={onClose} className="text-rose-400 text-lg">✕</button>
          <div className="text-sm font-bold">Edit Poker Table</div>
          <div className="w-8" />
        </div>
        {swapFrom !== null && (
          <div className="bg-amber-900/40 border border-amber-700 rounded p-2 mb-2 text-xs text-center">
            S{swapFrom} の入れ替え先をタップ
            <button
              onClick={() => setSwapFrom(null)}
              className="ml-2 underline text-amber-300"
            >
              キャンセル
            </button>
          </div>
        )}
        <div className="grid grid-cols-[28px_72px_44px_1fr_28px_28px] gap-1 text-[10px] text-neutral-400 border-b border-neutral-800 pb-1 mb-2">
          <div>S</div>
          <div>Stack</div>
          <div>Pos</div>
          <div>Name</div>
          <div className="text-center">↕</div>
          <div className="text-center">⌫</div>
        </div>
        {players.map((p) => {
          const pos = positions.get(p.seat) ?? "";
          const isBtn = p.seat === buttonSeat;
          const isSwapSrc = swapFrom === p.seat;
          return (
            <div
              key={p.seat}
              onClick={() => tapRow(p.seat)}
              className={`grid grid-cols-[28px_72px_44px_1fr_28px_28px] gap-1 items-center py-2 border-b border-neutral-800 ${
                swapFrom !== null && !isSwapSrc ? "bg-amber-900/10" : ""
              } ${isSwapSrc ? "bg-amber-900/40" : ""}`}
            >
              <div className="text-xs font-mono text-neutral-400">{p.seat}</div>
              <input
                type="number"
                inputMode="decimal"
                onFocus={(e) => e.currentTarget.select()}
                onClick={(e) => e.stopPropagation()}
                value={p.stack ?? ""}
                placeholder="0"
                onChange={(e) =>
                  onUpdate(p.seat, {
                    stack: e.target.value === "" ? null : parseFloat(e.target.value) || 0,
                  })
                }
                className="text-sm py-1"
              />
              <div className="text-xs font-bold">{isBtn ? "BTN" : pos || "—"}</div>
              <div onClick={(e) => e.stopPropagation()}>
                <NamePicker
                  value={p.name}
                  suggestions={suggestions}
                  onChange={(name) => onUpdate(p.seat, { name })}
                  className="text-left text-sm bg-neutral-800 rounded px-2 py-1.5 w-full block"
                />
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSwapFrom(swapFrom === p.seat ? null : p.seat);
                }}
                className={`mx-auto block w-7 h-7 rounded ${isSwapSrc ? "bg-amber-500" : "bg-neutral-800"}`}
                title="入れ替え"
              >
                ↕
              </button>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!confirm(`S${p.seat} を空席にしますか？`)) return;
                  await onEmpty(p.seat);
                }}
                className="mx-auto block w-7 h-7 rounded bg-neutral-800 text-rose-400"
                title="空席にする"
              >
                ⌫
              </button>
            </div>
          );
        })}

        <div className="mt-3 flex items-center justify-center gap-2 text-sm">
          <button
            onClick={onRemoveLastSeat}
            disabled={seatCount <= 2}
            className="px-3 py-1.5 bg-neutral-800 rounded disabled:opacity-40"
            title="末尾の席を削除（空席のみ）"
          >
            − 席を減らす
          </button>
          <div className="text-neutral-300">総席数 {seatCount}</div>
          <button
            onClick={onAddSeat}
            disabled={seatCount >= 11}
            className="px-3 py-1.5 bg-neutral-800 rounded disabled:opacity-40"
            title="席を1つ追加（最大11）"
          >
            ＋ 席を増やす
          </button>
        </div>
        <div className="text-center text-[11px] mt-2 text-neutral-500">
          末尾の席を空席にしてから削除できます（最小2、最大11）。新しい人が来たら名前を入れれば登録完了。
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HeroPositionSheet — pick Hero by position label (or by seat number if BTN
// isn't yet assigned)
// ---------------------------------------------------------------------------

export function HeroPositionSheet({
  activeSeats,
  buttonSeat,
  positions,
  currentHero,
  onCancel,
  onPick,
}: {
  activeSeats: number[];
  buttonSeat: number | null;
  positions: Map<number, string>;
  currentHero: number | null;
  onCancel: () => void;
  onPick: (seat: number) => void;
}) {
  const sorted = [...activeSeats].sort((a, b) => a - b);
  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-end" onClick={onCancel}>
      <div
        className="bg-neutral-900 w-full max-w-xl mx-auto p-4 rounded-t-2xl border-t border-neutral-800 safe-bottom max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold">Select Hero Position</div>
          <button onClick={onCancel} className="text-neutral-400">✕</button>
        </div>
        {buttonSeat === null && (
          <div className="text-xs text-amber-400 mb-2">
            BTN 未設定 — 席番号から選択。BTN を割り当てるとポジション表示に切り替わります。
          </div>
        )}
        {sorted.length === 0 ? (
          <div className="text-sm text-neutral-400 py-4 text-center">
            着席プレイヤーがいません。
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {sorted.map((seat) => (
              <button
                key={seat}
                onClick={() => onPick(seat)}
                className={`py-4 rounded font-bold text-sm ${currentHero === seat ? "bg-blue-500" : "bg-neutral-800"}`}
              >
                {positions.get(seat) ?? `S${seat}`}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
