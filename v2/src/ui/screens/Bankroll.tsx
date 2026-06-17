import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../data/db";
import { Bankroll as BankrollRepo, Settings } from "../../data/repo";
import type { BankrollEntry } from "../../data/types";
import BankrollEntrySheet from "../components/BankrollEntrySheet";

// Per-entry helpers ----------------------------------------------------------

function entryNet(e: BankrollEntry): number {
  if (e.type === "SESSION") return e.cashOut - e.buyInTotal;
  return e.amount; // signed
}
function entryDurationMin(e: BankrollEntry): number | null {
  if (e.type !== "SESSION") return null;
  if (!e.startAt || !e.endAt) return null;
  return Math.max(0, (e.endAt - e.startAt) / 60000);
}
function entryHourly(e: BankrollEntry): number | null {
  const min = entryDurationMin(e);
  if (min === null || min <= 0) return null;
  return (entryNet(e) / min) * 60;
}
function toBase(e: BankrollEntry): number {
  // signed amount in the bankroll's base currency
  return entryNet(e) * (e.exchangeRate || 1);
}

function fmtCurrency(n: number, ccy: string): string {
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(n);
  return `${sign}${ccy} ${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

// ----------------------------------------------------------------------------

export default function Bankroll() {
  const nav = useNavigate();
  const entries = useLiveQuery(() => BankrollRepo.list(), []);
  const settings = useLiveQuery(() => Settings.get(), []);
  const sessions = useLiveQuery(() => db.sessions.toArray(), []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState<null | "SESSION" | "TRANSACTION">(null);

  const baseCcy = settings?.baseCurrency ?? "JPY";

  const stats = useMemo(() => {
    if (!entries) return null;
    const total = entries.reduce((s, e) => s + toBase(e), 0);
    const sessionEntries = entries.filter((e) => e.type === "SESSION");
    const sessionNet = sessionEntries.reduce((s, e) => s + toBase(e), 0);
    const sessionMinutes = sessionEntries.reduce(
      (s, e) => s + (entryDurationMin(e) ?? 0),
      0
    );
    const hourly = sessionMinutes > 0 ? (sessionNet / sessionMinutes) * 60 : null;
    const wins = sessionEntries.filter((e) => entryNet(e) > 0).length;
    const losses = sessionEntries.filter((e) => entryNet(e) < 0).length;
    // Win rate excludes break-even sessions from BOTH the numerator and the
    // denominator so the rendered "% (wins/wins+losses)" pair is internally
    // consistent. A pure break-even history shows "—".
    const decided = wins + losses;
    return {
      total,
      sessionCount: sessionEntries.length,
      sessionNet,
      hourly,
      hours: sessionMinutes / 60,
      winRate: decided > 0 ? (wins / decided) * 100 : null,
      wins,
      losses,
    };
  }, [entries]);

  // ----- Equity curve (cumulative bankroll in base currency, oldest first) --

  const curve = useMemo(() => {
    if (!entries) return [];
    const sorted = [...entries].sort((a, b) => (a.startAt ?? 0) - (b.startAt ?? 0));
    let cum = 0;
    return sorted.map((e) => {
      cum += toBase(e);
      return { id: e.id, cum, at: e.startAt ?? 0 };
    });
  }, [entries]);

  if (!entries || !settings || !sessions) return null;

  const sessionsAlive = sessions.filter((s) => s.deletedAt === null);

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center px-3 py-2 border-b border-neutral-800">
        <button onClick={() => nav(-1)} className="text-emerald-400 text-sm">
          ‹ Back
        </button>
        <div className="flex-1 text-center font-bold">Bankroll</div>
        <button
          onClick={async () => {
            const next = prompt("基準通貨（例: JPY / USD / EUR）", baseCcy);
            if (next) await Settings.update({ baseCurrency: next.toUpperCase().slice(0, 3) });
          }}
          className="text-xs px-2 py-1 bg-neutral-800 rounded"
        >
          基準: {baseCcy}
        </button>
      </div>

      {/* KPIs */}
      {stats && (
        <div className="p-3 grid grid-cols-2 gap-2">
          <KpiCard
            label="累計"
            value={fmtCurrency(stats.total, baseCcy)}
            tone={stats.total >= 0 ? "good" : "bad"}
          />
          <KpiCard
            label={`時給（${stats.hours.toFixed(1)}h）`}
            value={stats.hourly === null ? "—" : fmtCurrency(stats.hourly, baseCcy)}
            tone={
              stats.hourly === null
                ? "neutral"
                : stats.hourly >= 0
                  ? "good"
                  : "bad"
            }
          />
          <KpiCard
            label="セッション数"
            value={`${stats.sessionCount}`}
            tone="neutral"
          />
          <KpiCard
            label="勝率"
            value={
              stats.winRate === null
                ? "—"
                : `${stats.winRate.toFixed(0)}% (${stats.wins}/${stats.wins + stats.losses})`
            }
            tone="neutral"
          />
        </div>
      )}

      {/* Equity curve */}
      <div className="px-3">
        <EquityCurve points={curve} />
      </div>

      {/* New entry + list */}
      <div className="flex-1 p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setCreating("SESSION")}
            className="py-3 bg-blue-500 rounded font-bold text-sm"
          >
            ＋ セッション記録
          </button>
          <button
            onClick={() => setCreating("TRANSACTION")}
            className="py-3 bg-neutral-700 rounded font-bold text-sm"
          >
            ＋ 入出金
          </button>
        </div>

        <ul className="space-y-2 mt-2">
          {entries.length === 0 && (
            <li className="text-center text-sm text-neutral-500 py-4">
              まだ記録がありません
            </li>
          )}
          {entries.map((e) => {
            const net = entryNet(e);
            const hourly = entryHourly(e);
            return (
              <li
                key={e.id}
                onClick={() => setEditingId(e.id)}
                className="bg-neutral-900 border border-neutral-800 rounded p-3 cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-sm">
                      {e.type === "SESSION" ? e.location || "(場所未設定)" : e.label || "(ラベル無)"}
                    </div>
                    <div className="text-[11px] text-neutral-400">
                      {e.startAt ? new Date(e.startAt).toLocaleDateString() : "—"}
                      {e.type === "SESSION" && e.stakes ? ` · ${e.stakes}` : ""}
                      {e.type === "SESSION" && e.gameType ? ` · ${e.gameType}` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className={`font-bold ${net >= 0 ? "text-emerald-400" : "text-rose-400"}`}
                    >
                      {fmtCurrency(net, e.currency)}
                    </div>
                    {hourly !== null && (
                      <div className="text-[11px] text-neutral-400">
                        {fmtCurrency(hourly, e.currency)}/h
                      </div>
                    )}
                    {e.currency !== baseCcy && (
                      <div className="text-[10px] text-neutral-500">
                        @{e.exchangeRate} → {fmtCurrency(toBase(e), baseCcy)}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* sheets */}
      {creating && (
        <BankrollEntrySheet
          mode="create"
          kind={creating}
          baseCurrency={baseCcy}
          sessions={sessionsAlive}
          onCancel={() => setCreating(null)}
          onSave={async (draft) => {
            await BankrollRepo.create(draft);
            setCreating(null);
          }}
        />
      )}
      {editingId && (() => {
        const e = entries.find((x) => x.id === editingId);
        if (!e) return null;
        return (
          <BankrollEntrySheet
            mode="edit"
            kind={e.type}
            baseCurrency={baseCcy}
            sessions={sessionsAlive}
            initial={e}
            onCancel={() => setEditingId(null)}
            onSave={async (draft) => {
              await BankrollRepo.update(e.id, draft);
              setEditingId(null);
            }}
            onDelete={async () => {
              await BankrollRepo.remove(e.id);
              setEditingId(null);
            }}
          />
        );
      })()}
    </div>
  );
}

// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "bad" | "neutral";
}) {
  const color =
    tone === "good"
      ? "text-emerald-400"
      : tone === "bad"
        ? "text-rose-400"
        : "text-neutral-200";
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded p-3">
      <div className="text-[10px] text-neutral-400 uppercase tracking-wider">{label}</div>
      <div className={`font-bold ${color}`}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function EquityCurve({
  points,
}: {
  points: { id: string; cum: number; at: number }[];
}) {
  if (points.length < 2) {
    return (
      <div className="h-24 bg-neutral-900 border border-neutral-800 rounded flex items-center justify-center text-xs text-neutral-500">
        セッション記録が増えるとグラフが出ます
      </div>
    );
  }
  const w = 320;
  const h = 90;
  const xs = points.map((_, i) => (i / (points.length - 1)) * w);
  const ys_raw = points.map((p) => p.cum);
  const min = Math.min(0, ...ys_raw);
  const max = Math.max(0, ...ys_raw);
  const span = max - min || 1;
  const ys = ys_raw.map((y) => h - 4 - ((y - min) / span) * (h - 8));
  const zero = h - 4 - ((0 - min) / span) * (h - 8);
  const path =
    "M " + xs.map((x, i) => `${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(" L ");
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded p-2">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        <line x1="0" y1={zero} x2={w} y2={zero} stroke="#555" strokeDasharray="3 3" />
        <path d={path} stroke="#34d399" strokeWidth="2" fill="none" />
      </svg>
    </div>
  );
}
