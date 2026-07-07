import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../data/db";
import { Actions, Hands } from "../../data/repo";
import { computeState } from "../../engine/reducer";
import { makeSetup } from "../../engine/setup";
import type { Hand } from "../../data/types";
import { exportSessionCSV, exportSessionJSON } from "../export";
import PlayingCard from "../components/PlayingCard";
import { positionLabels } from "../positions";

/**
 * Review — hand-history list with quick filters and a richer drill-in.
 * The detail panel now shows board + Hero/known cards, position labels,
 * net per seat, an action log, the session memo when present, and an
 * "Edit" link that re-opens the hand in the play screen for corrections.
 */
export default function Review() {
  const nav = useNavigate();
  const sessions = useLiveQuery(() => db.sessions.toArray(), []);
  const allHands = useLiveQuery(() => db.hands.toArray(), []);
  const [filterSession, setFilterSession] = useState<string | "all">("all");
  const [filterShowdown, setFilterShowdown] = useState<"any" | "yes" | "no">("any");
  const [filterFinalized, setFilterFinalized] = useState<"any" | "yes" | "no">("any");
  const [opened, setOpened] = useState<string | null>(null);

  if (!sessions || !allHands) return null;

  const sessionsAlive = sessions
    .filter((s) => s.deletedAt === 0)
    .sort((a, b) => b.startedAt - a.startedAt);

  const handsAlive = allHands.filter((h) => h.deletedAt === 0);

  const filtered = handsAlive
    .filter((h) => filterSession === "all" || h.sessionId === filterSession)
    .filter(
      (h) =>
        filterShowdown === "any" ||
        (filterShowdown === "yes" && h.result.wentToShowdown) ||
        (filterShowdown === "no" && !h.result.wentToShowdown)
    )
    .filter(
      (h) =>
        filterFinalized === "any" ||
        (filterFinalized === "yes" && h.finalized) ||
        (filterFinalized === "no" && !h.finalized)
    )
    .sort((a, b) => b.startedAt - a.startedAt);

  const sessionById = new Map(sessionsAlive.map((s) => [s.id, s]));

  // export entry: when a single session is selected, export it; otherwise
  // offer the most-recently-played one — better than disabling outright.
  const exportTarget =
    filterSession !== "all"
      ? filterSession
      : sessionsAlive.find((s) =>
          handsAlive.some((h) => h.sessionId === s.id)
        )?.id ?? null;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center px-3 py-2 border-b border-neutral-800">
        <button onClick={() => nav(-1)} className="text-emerald-400 text-sm">
          ‹ Back
        </button>
        <div className="flex-1 text-center font-bold">Review</div>
        {exportTarget && (
          <div className="flex gap-1">
            <button
              onClick={() => exportSessionCSV(exportTarget)}
              className="text-xs px-2 py-1 bg-neutral-800 rounded"
            >
              CSV
            </button>
            <button
              onClick={() => exportSessionJSON(exportTarget)}
              className="text-xs px-2 py-1 bg-neutral-800 rounded"
            >
              JSON
            </button>
          </div>
        )}
      </div>

      <div className="p-3 space-y-2">
        <div>
          <label>セッション</label>
          <select
            value={filterSession}
            onChange={(e) => setFilterSession(e.target.value as string)}
          >
            <option value="all">全セッション</option>
            {sessionsAlive.map((s) => (
              <option key={s.id} value={s.id}>
                {s.date} · {s.casino || "(未設定)"} · {s.sb}/{s.bb}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-1 text-[11px]">
          <span className="text-neutral-500 px-1 py-1">SD:</span>
          {(["any", "yes", "no"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilterShowdown(k)}
              className={`px-2 py-1 rounded ${filterShowdown === k ? "bg-blue-500" : "bg-neutral-800"}`}
            >
              {k === "any" ? "All" : k === "yes" ? "SD有" : "非SD"}
            </button>
          ))}
          <span className="text-neutral-500 px-1 py-1 ml-2">確定:</span>
          {(["any", "yes", "no"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilterFinalized(k)}
              className={`px-2 py-1 rounded ${filterFinalized === k ? "bg-blue-500" : "bg-neutral-800"}`}
            >
              {k === "any" ? "All" : k === "yes" ? "確定" : "未確定"}
            </button>
          ))}
        </div>
      </div>

      <ul className="flex-1 px-3 space-y-2 pb-3">
        {filtered.length === 0 && (
          <li className="text-center text-sm text-neutral-500 py-4">
            該当するハンドがありません
          </li>
        )}
        {filtered.map((h) => (
          <HandRow
            key={h.id}
            hand={h}
            sessionLabel={
              sessionById.get(h.sessionId)?.casino ??
              sessionById.get(h.sessionId)?.date ??
              ""
            }
            opened={opened === h.id}
            onToggle={() => setOpened(opened === h.id ? null : h.id)}
          />
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------

function HandRow({
  hand,
  sessionLabel,
  opened,
  onToggle,
}: {
  hand: Hand;
  sessionLabel: string;
  opened: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="bg-neutral-900 border border-neutral-800 rounded">
      <button onClick={onToggle} className="w-full text-left p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold text-sm">
              #{hand.handNo} ·{" "}
              <span className="text-neutral-400">
                {hand.sb}/{hand.bb}
              </span>
              {sessionLabel && (
                <span className="text-[10px] text-neutral-500 ml-2">
                  · {sessionLabel}
                </span>
              )}
            </div>
            <div className="text-[11px] text-neutral-400">
              {new Date(hand.startedAt).toLocaleString()}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold">Pot {hand.pot}</div>
            <div className="text-[11px] text-neutral-400">
              {hand.result.wentToShowdown ? "SD" : "非SD"}
              {hand.finalized ? "" : " · 未確定"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 mt-2">
          {(hand.board.flop ?? [null, null, null]).map((c, i) => (
            <PlayingCard key={`f${i}`} card={c} size="xs" />
          ))}
          <PlayingCard card={hand.board.turn} size="xs" />
          <PlayingCard card={hand.board.river} size="xs" />
          {hand.heroCards && (
            <>
              <span className="text-neutral-500 px-1 text-[10px]">Hero</span>
              <PlayingCard card={hand.heroCards[0]} size="xs" />
              <PlayingCard card={hand.heroCards[1]} size="xs" />
            </>
          )}
        </div>
      </button>
      {opened && <HandDetail hand={hand} />}
    </li>
  );
}

function HandDetail({ hand }: { hand: Hand }) {
  const nav = useNavigate();
  const stored = useLiveQuery(() => Actions.forHand(hand.id), [hand.id]);
  const session = useLiveQuery(() => db.sessions.get(hand.sessionId), [hand.sessionId]);
  const summary = useMemo(() => {
    if (!stored) return null;
    // Same miss-blind-post adapter Hand.tsx uses — without it a hand with a
    // returning-player post understates spentTotal and overstates net.
    const posts = hand.seats.flatMap((s) =>
      s.posted.flatMap((p) =>
        p.kind === "post"
          ? [
              {
                seat: s.seat,
                amount: p.amount,
                ante: s.posted.find((x) => x.kind === "post_ante")?.amount,
              },
            ]
          : []
      )
    );
    const setup = makeSetup({
      seats: hand.seats.map((s) => ({ seat: s.seat, startStack: s.startStack })),
      seatCount: Math.max(...hand.seats.map((s) => s.seat), 2),
      buttonSeat: hand.buttonSeat,
      sb: hand.sb,
      bb: hand.bb,
      bbAnte: hand.ante,
      autoStraddle: hand.autoStraddle,
      straddleAmount: hand.straddleAmount > 0 ? hand.straddleAmount : undefined,
      posts: posts.length > 0 ? posts : undefined,
    });
    const engineActions = stored.map((a) => ({
      street: a.street,
      seat: a.seat,
      type: a.type,
      amount: a.amount,
    }));
    return computeState(setup, engineActions);
  }, [hand, stored]);

  if (!stored || !summary) return null;

  const positions = positionLabels(
    hand.seats.map((s) => s.seat),
    hand.buttonSeat
  );
  const knownBySeat = new Map<number, [string, string]>();
  for (const k of hand.result.knownCards) knownBySeat.set(k.seat, k.cards);
  // Prefer the hero seat snapshotted onto the hand itself — falls back to the
  // session's CURRENT hero seat only for hands saved before that field
  // existed, so a mid-session seat swap can't repaint who Hero was in a past
  // hand.
  const handHeroSeat = hand.heroSeat ?? session?.heroSeat ?? null;

  return (
    <div className="border-t border-neutral-800 p-3 space-y-3 text-xs">
      {/* board strip */}
      <div className="flex items-center gap-1 justify-center">
        {(hand.board.flop ?? [null, null, null]).map((c, i) => (
          <PlayingCard key={`f${i}`} card={c} size="sm" />
        ))}
        <PlayingCard card={hand.board.turn} size="sm" />
        <PlayingCard card={hand.board.river} size="sm" />
      </div>

      {/* per-seat summary with position, cards, net */}
      <div className="space-y-1">
        {hand.seats.map((s) => {
          const spent = summary.spentTotal[s.seat] ?? 0;
          const won = hand.result.winners.find((w) => w.seat === s.seat)?.amount ?? 0;
          const net = won - spent;
          const isHero = handHeroSeat === s.seat;
          const cards = isHero
            ? hand.heroCards
            : knownBySeat.get(s.seat) ?? null;
          const pos = positions.get(s.seat) ?? "";
          return (
            <div
              key={s.seat}
              className="flex items-center gap-2 bg-neutral-950/40 border border-neutral-800 rounded px-2 py-1"
            >
              <div className="flex gap-0.5">
                <PlayingCard card={cards?.[0] ?? null} size="xs" faceDown={!cards} />
                <PlayingCard card={cards?.[1] ?? null} size="xs" faceDown={!cards} />
              </div>
              <div className="flex-1 truncate">
                <span className="text-neutral-400">{pos}</span>
                <span className={`ml-1 ${isHero ? "text-yellow-300 font-bold" : "text-neutral-200"}`}>
                  {isHero ? "★ " : ""}
                  {s.name}
                </span>
              </div>
              <div className="text-right">
                <div className={`text-sm font-bold ${net >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {net >= 0 ? "+" : ""}
                  {net}
                </div>
                {won > 0 && (
                  <div className="text-[10px] text-emerald-300">won {won}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* side pots if any */}
      {summary.sidePots.length > 1 && (
        <div className="bg-neutral-950/60 border border-neutral-800 rounded p-2">
          <div className="text-[10px] text-amber-300 mb-1">Side pots</div>
          {summary.sidePots.map((sp, idx) => (
            <div key={idx} className="text-[11px] text-neutral-300">
              {idx === 0 ? "Main" : `Side ${idx}`}: ${sp.amount}{" "}
              <span className="text-neutral-500">
                ({sp.eligible.map((s) => `S${s}`).join(", ")})
              </span>
            </div>
          ))}
        </div>
      )}

      {/* action log */}
      <div>
        <div className="text-[10px] text-neutral-400 mb-1">Action log</div>
        <div className="font-mono text-[11px] space-y-0.5">
          {stored.map((a) => (
            <div key={a.id} className="flex gap-2">
              <span className="text-neutral-500 w-8">{a.street}</span>
              <span className="w-8">S{a.seat}</span>
              <span className="flex-1 uppercase">{a.type}</span>
              <span>{a.amount > 0 ? a.amount : ""}</span>
            </div>
          ))}
        </div>
      </div>

      {hand.note && (
        <div>
          <div className="text-[10px] text-neutral-400 mb-1">Note</div>
          <div className="text-sm whitespace-pre-wrap">{hand.note}</div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        {/* No Edit link for a soft-deleted hand — the play screen refuses to
            edit tombstoned hands anyway, but don't invite it. (The list above
            already filters tombstones out, so this is a belt-and-braces guard
            that keeps the invariant local to the Edit affordance.) */}
        {hand.deletedAt === 0 && (
          <button
            onClick={() => nav(`/sessions/${hand.sessionId}/hands/${hand.id}`)}
            className="px-3 py-1 bg-blue-600 rounded text-xs font-bold"
          >
            編集
          </button>
        )}
        <a
          href={gtoWizardLink(hand)}
          target="_blank"
          rel="noreferrer"
          className="px-3 py-1 bg-emerald-700 rounded text-xs font-bold"
        >
          GTO Wizard で開く
        </a>
        <button
          onClick={async () => {
            if (!confirm("このハンドを削除しますか？（取り消し可能）")) return;
            await Hands.remove(hand.id);
          }}
          className="ml-auto text-xs text-rose-400 px-2"
        >
          削除
        </button>
      </div>
    </div>
  );
}

// GTO Wizard does not expose a stable deep-link API, so we link to a search
// pre-filled with the stakes + Hero cards + board. The user can then load the
// matching spot one tap away inside GTOW.
function gtoWizardLink(hand: Hand): string {
  const parts: string[] = [`${hand.sb}/${hand.bb}`];
  if (hand.heroCards) parts.push(hand.heroCards.join(""));
  if (hand.board.flop) {
    const filled = hand.board.flop.filter((c): c is string => !!c);
    if (filled.length > 0) parts.push(filled.join(""));
  }
  if (hand.board.turn) parts.push(hand.board.turn);
  if (hand.board.river) parts.push(hand.board.river);
  const q = encodeURIComponent(parts.join(" "));
  return `https://app.gtowizard.com/?q=${q}`;
}
