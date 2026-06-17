import { useState } from "react";
import type {
  BankrollEntry,
  BankrollEntryType,
  GameType,
  Session,
} from "../../data/types";

function toDateInput(ms: number | null): string {
  if (!ms) return "";
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}
function toTimeInput(ms: number | null): string {
  if (!ms) return "";
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function mergeDateTime(dateStr: string, timeStr: string): number | null {
  if (!dateStr) return null;
  if (!timeStr) return new Date(dateStr).getTime();
  return new Date(`${dateStr}T${timeStr}`).getTime();
}

type Draft = Omit<BankrollEntry, "id" | "updatedAt" | "deletedAt">;

export default function BankrollEntrySheet({
  mode,
  kind,
  baseCurrency,
  sessions,
  initial,
  onCancel,
  onSave,
  onDelete,
}: {
  mode: "create" | "edit";
  kind: BankrollEntryType;
  baseCurrency: string;
  sessions: Session[];
  initial?: BankrollEntry;
  onCancel: () => void;
  onSave: (draft: Draft) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>(() =>
    initial
      ? { ...stripMeta(initial) }
      : freshDraft(kind, baseCurrency)
  );

  const [startDate, setStartDate] = useState(toDateInput(draft.startAt));
  const [startTime, setStartTime] = useState(toTimeInput(draft.startAt));
  const [endDate, setEndDate] = useState(toDateInput(draft.endAt));
  const [endTime, setEndTime] = useState(toTimeInput(draft.endAt));

  const commitTimes = () => ({
    ...draft,
    startAt: mergeDateTime(startDate, startTime),
    endAt: mergeDateTime(endDate, endTime),
  });

  // Rate guarantee: when the entry is already IN the base currency the rate
  // must be 1 (the label reads "1 X = ? Y" so a stray 0 or non-1 would zero
  // out / mis-scale the row's contribution to totals). Otherwise the rate
  // must be a positive number — 0 silently drops the row from base totals.
  const isBase =
    draft.currency.length === 3 &&
    baseCurrency.length === 3 &&
    draft.currency === baseCurrency;
  const rateValid = isBase
    ? draft.exchangeRate === 1
    : Number.isFinite(draft.exchangeRate) && draft.exchangeRate > 0;

  const save = async () => {
    const final = commitTimes();
    if (final.startAt === null && kind === "SESSION") {
      alert("開始日時を入力してください");
      return;
    }
    if (!rateValid) {
      alert(
        isBase
          ? "基準通貨の場合、為替レートは 1 にしてください"
          : "為替レートは 0 より大きい値を入力してください"
      );
      return;
    }
    await onSave(final);
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-end" onClick={onCancel}>
      <div
        className="bg-neutral-900 w-full max-w-xl mx-auto p-4 rounded-t-2xl border-t border-neutral-800 safe-bottom max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-bold mb-3">
          {kind === "SESSION" ? "セッション記録" : "入出金"}
          {mode === "edit" ? "（編集）" : ""}
        </div>

        {kind === "SESSION" ? (
          <SessionFields
            draft={draft}
            setDraft={setDraft}
            sessions={sessions}
            startDate={startDate}
            startTime={startTime}
            setStartDate={setStartDate}
            setStartTime={setStartTime}
            endDate={endDate}
            endTime={endTime}
            setEndDate={setEndDate}
            setEndTime={setEndTime}
          />
        ) : (
          <TransactionFields draft={draft} setDraft={setDraft} startDate={startDate} setStartDate={setStartDate} />
        )}

        <div className="grid grid-cols-2 gap-2 mt-3">
          <div>
            <label>通貨</label>
            <input
              value={draft.currency}
              onChange={(e) => {
                const next = e.target.value.toUpperCase().slice(0, 3);
                // When the user switches the entry's currency TO the base,
                // also snap the rate to 1 so we don't carry over a stale
                // foreign rate that would multiply the base total wrongly.
                const sameAsBase = next.length === 3 && next === baseCurrency;
                setDraft({
                  ...draft,
                  currency: next,
                  exchangeRate: sameAsBase ? 1 : draft.exchangeRate,
                });
              }}
              maxLength={3}
            />
          </div>
          <div>
            <label>
              1{draft.currency || "—"} = ? {baseCurrency || "—"}
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="0.0001"
              min="0"
              onFocus={(e) => e.currentTarget.select()}
              disabled={isBase}
              value={draft.exchangeRate}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  // accept "" / partial input without forcing 0 — only the
                  // save guard rejects non-positive rates.
                  exchangeRate: e.target.value === "" ? 0 : parseFloat(e.target.value),
                })
              }
              className={!rateValid ? "border border-rose-500" : ""}
            />
            {isBase && (
              <div className="text-[10px] text-neutral-500 mt-0.5">
                基準通貨と同じ → 1 で固定
              </div>
            )}
          </div>
        </div>

        <div className="mt-3">
          <label>メモ</label>
          <textarea
            rows={2}
            value={draft.note}
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          />
        </div>

        <div className="flex gap-2 mt-4">
          {onDelete && (
            <button onClick={onDelete} className="px-4 py-3 bg-rose-700 rounded text-sm">
              削除
            </button>
          )}
          <button onClick={onCancel} className="flex-1 py-3 bg-neutral-800 rounded">
            Cancel
          </button>
          <button onClick={save} className="flex-1 py-3 bg-blue-500 rounded font-bold">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function freshDraft(kind: BankrollEntryType, baseCurrency: string): Draft {
  const now = Date.now();
  return {
    type: kind,
    sessionId: null,
    buyInTotal: 0,
    cashOut: 0,
    startAt: now,
    endAt: kind === "SESSION" ? now : null,
    location: "",
    stakes: "",
    gameType: kind === "SESSION" ? "NLH" : "",
    amount: 0,
    label: "",
    currency: baseCurrency,
    exchangeRate: 1,
    note: "",
  };
}
function stripMeta(e: BankrollEntry): Draft {
  const { id: _id, updatedAt: _u, deletedAt: _d, ...rest } = e;
  return rest;
}

// ---------------------------------------------------------------------------

function SessionFields({
  draft,
  setDraft,
  sessions,
  startDate,
  startTime,
  setStartDate,
  setStartTime,
  endDate,
  endTime,
  setEndDate,
  setEndTime,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  sessions: Session[];
  startDate: string;
  startTime: string;
  setStartDate: (s: string) => void;
  setStartTime: (s: string) => void;
  endDate: string;
  endTime: string;
  setEndDate: (s: string) => void;
  setEndTime: (s: string) => void;
}) {
  const net = draft.cashOut - draft.buyInTotal;
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label>場所</label>
          <input
            value={draft.location}
            onChange={(e) => setDraft({ ...draft, location: e.target.value })}
            placeholder="例: Bellagio"
          />
        </div>
        <div>
          <label>ステークス</label>
          <input
            value={draft.stakes}
            onChange={(e) => setDraft({ ...draft, stakes: e.target.value })}
            placeholder="1/3"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <div>
          <label>ゲーム</label>
          <select
            value={draft.gameType}
            onChange={(e) =>
              setDraft({ ...draft, gameType: e.target.value as GameType | "" })
            }
          >
            <option value="NLH">NLH</option>
            <option value="PLO">PLO</option>
            <option value="PLO5">PLO5</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div>
          <label>紐付けセッション（任意）</label>
          <select
            value={draft.sessionId ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, sessionId: e.target.value || null })
            }
          >
            <option value="">—</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                #{s.id.slice(0, 4)} {s.date} {s.casino}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <div>
          <label>バイイン合計</label>
          <input
            type="number"
            inputMode="decimal"
            onFocus={(e) => e.currentTarget.select()}
            value={draft.buyInTotal}
            onChange={(e) => setDraft({ ...draft, buyInTotal: parseFloat(e.target.value) || 0 })}
          />
        </div>
        <div>
          <label>キャッシュアウト</label>
          <input
            type="number"
            inputMode="decimal"
            onFocus={(e) => e.currentTarget.select()}
            value={draft.cashOut}
            onChange={(e) => setDraft({ ...draft, cashOut: parseFloat(e.target.value) || 0 })}
          />
        </div>
      </div>

      <div className={`text-sm font-bold mt-2 ${net >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
        Net: {net >= 0 ? "+" : ""}
        {net}
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <div>
          <label>開始日</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <label>開始時刻</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>
        <div>
          <label>終了日</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <div>
          <label>終了時刻</label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </div>
      </div>
    </>
  );
}

function TransactionFields({
  draft,
  setDraft,
  startDate,
  setStartDate,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  startDate: string;
  setStartDate: (s: string) => void;
}) {
  return (
    <>
      <div>
        <label>ラベル</label>
        <input
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          placeholder="例: 入金 / 出金 / トーナメント"
        />
      </div>
      <div className="mt-3">
        <label>金額（＋は入金、−は出金）</label>
        <input
          type="number"
          inputMode="decimal"
          onFocus={(e) => e.currentTarget.select()}
          value={draft.amount}
          onChange={(e) => setDraft({ ...draft, amount: parseFloat(e.target.value) || 0 })}
        />
      </div>
      <div className="mt-3">
        <label>日付</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </div>
    </>
  );
}
