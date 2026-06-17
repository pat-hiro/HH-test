import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../data/db";
import { Hands, Players, Sessions, Settings } from "../../data/repo";
import { bbSeat, nextActive, sbSeat } from "../../engine/setup";
import PokerTable from "../components/PokerTable";
import type { SeatVM } from "../components/PokerTable";
import {
  AdjustAllSheet,
  AnteSheet,
  BlindsSheet,
  EditTableSheet,
  HeroPositionSheet,
  PlayerEditSheet,
} from "../components/SetupSheets";
import BankrollEntrySheet from "../components/BankrollEntrySheet";
import { Bankroll } from "../../data/repo";
import { positionLabels } from "../positions";

const COMMON_CURRENCIES = ["JPY", "USD", "EUR", "GBP", "CNY", "KRW", "AUD"];

/**
 * Cash Setup — full MVP. All control flows are sheets so the table view
 * stays visible at the top; the screen never scrolls a control off-screen.
 */
export default function Setup() {
  const { sessionId } = useParams();
  const nav = useNavigate();
  const session = useLiveQuery(
    () => (sessionId ? db.sessions.get(sessionId) : undefined),
    [sessionId]
  );
  const roster = useLiveQuery(
    () =>
      sessionId
        ? db.sessionPlayers
            .where("sessionId")
            .equals(sessionId)
            .toArray()
            .then((rs) =>
              rs.filter((r) => r.deletedAt === null).sort((a, b) => a.seat - b.seat)
            )
        : [],
    [sessionId]
  );
  const settings = useLiveQuery(() => Settings.get(), []);
  const heroDefault = settings?.heroDefaultName?.trim() || "Hero";
  const knownCurrencies = [
    ...COMMON_CURRENCIES,
    ...(settings?.extraCurrencies ?? []),
  ];
  const nameSuggestions = useLiveQuery(
    () =>
      db.sessionPlayers.toArray().then((ps) => {
        const counts = new Map<string, number>();
        for (const p of ps) {
          if (p.deletedAt !== null) continue;
          const n = p.name.trim();
          if (!n) continue;
          counts.set(n, (counts.get(n) ?? 0) + 1);
        }
        return Array.from(counts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([n]) => n);
      }),
    []
  );

  // sheets
  const [assignBtnMode, setAssignBtnMode] = useState(false);
  const [editingSeat, setEditingSeat] = useState<number | null>(null);
  const [showBlinds, setShowBlinds] = useState(false);
  const [showAnte, setShowAnte] = useState(false);
  const [showHero, setShowHero] = useState(false);
  const [showAdjustAll, setShowAdjustAll] = useState(false);
  const [showEditTable, setShowEditTable] = useState(false);
  const [showEndSession, setShowEndSession] = useState(false);

  const activeSeats = useMemo(
    () =>
      (roster ?? []).filter((p) => !p.isAway && p.name.trim() !== "").map((p) => p.seat),
    [roster]
  );

  const positions = useMemo(
    () => positionLabels(activeSeats, session?.buttonSeat ?? null),
    [activeSeats, session?.buttonSeat]
  );

  // For the End-Session bankroll prefill, compute Hero's session aggregate:
  //  - cashOut  = Hero's current stack (carried across hands by Next Hand)
  //  - buyInTotal = same starting amount, IF a bankroll row already exists for
  //    this session we re-use the user's prior buy-in input; otherwise default
  //    to Hero's stack at hand #1.
  const sessionHands = useLiveQuery(
    () =>
      sessionId
        ? db.hands
            .where("sessionId")
            .equals(sessionId)
            .toArray()
            .then((hs) => hs.filter((h) => h.deletedAt === null))
        : [],
    [sessionId]
  );
  const existingBankroll = useLiveQuery(
    () => (sessionId ? Bankroll.forSession(sessionId) : undefined),
    [sessionId]
  );
  const heroSeatNum = roster?.find((p) => p.isHero)?.seat ?? null;
  const heroFirstStack = (() => {
    if (heroSeatNum === null || !sessionHands || sessionHands.length === 0) return 0;
    const sorted = [...sessionHands].sort((a, b) => a.handNo - b.handNo);
    const first = sorted[0];
    return first.seats.find((s) => s.seat === heroSeatNum)?.startStack ?? 0;
  })();
  const heroCurrentStack =
    roster?.find((p) => p.seat === heroSeatNum)?.stack ?? heroFirstStack;

  if (!session || !roster) {
    return (
      <div className="min-h-screen flex items-center justify-center text-neutral-500 text-sm">
        Loading session…
      </div>
    );
  }

  // ----- VM ----------------------------------------------------------------

  // Preview of where the forced bets will land on the next hand, so the user
  // can verify SB / BB / straddle / ante BEFORE pressing Start Hand. Needs
  // BTN assigned + ≥2 active seats; else falls back to no chips on the felt.
  const previewSb =
    session.buttonSeat !== null
      ? sbSeat(session.buttonSeat, session.seatCount, activeSeats)
      : null;
  const previewBb =
    session.buttonSeat !== null
      ? bbSeat(session.buttonSeat, session.seatCount, activeSeats)
      : null;
  const previewUtg =
    previewBb !== null
      ? nextActive(previewBb, session.seatCount, activeSeats)
      : null;
  // Miss-blind posts contribute to the seeded pot too — without them the
  // preview number disagrees with what gets actually posted on Start Hand.
  const previewPosts = roster
    .filter((p) => activeSeats.includes(p.seat) && p.mustPostBB)
    .reduce(
      (sum, p) =>
        sum + session.bb + (p.postWithAnte && session.ante > 0 ? session.ante : 0),
      0
    );
  const previewPot =
    (previewSb !== null ? session.sb : 0) +
    (previewBb !== null ? session.bb : 0) +
    (session.autoStraddle && previewUtg !== null
      ? session.straddleAmount > 0
        ? session.straddleAmount
        : session.bb * 2
      : 0) +
    (previewBb !== null ? session.ante : 0) +
    previewPosts;

  const seatsVM: SeatVM[] = roster.map((p) => ({
    seat: p.seat,
    position: positions.get(p.seat) ?? "",
    name: p.name,
    // empty chairs show no stack — just the seat number + ＋
    stack: p.name.trim() === "" ? null : p.stack,
    isHero: p.isHero,
    isBTN: p.seat === session.buttonSeat,
    isCurrent: false,
    isFolded: p.isAway,
    isAllIn: false,
    cards: null,
    // a chair with no name is an empty seat (＋ to add a player)
    empty: p.name.trim() === "",
    liveBet:
      p.seat === previewSb
        ? session.sb
        : p.seat === previewBb
          ? session.bb
          : session.autoStraddle && p.seat === previewUtg
            ? session.straddleAmount > 0
              ? session.straddleAmount
              : session.bb * 2
            : 0,
    blind:
      p.seat === previewSb
        ? "sb"
        : p.seat === previewBb
          ? "bb"
          : session.autoStraddle && p.seat === previewUtg
            ? "straddle"
            : null,
    ante: session.ante > 0 && p.seat === previewBb ? session.ante : 0,
  }));

  // ----- handlers ----------------------------------------------------------

  const onTapSeat = async (seat: number) => {
    if (assignBtnMode) {
      if (activeSeats.includes(seat)) {
        await Sessions.update(session.id, { buttonSeat: seat });
      }
      setAssignBtnMode(false);
      return;
    }
    setEditingSeat(seat);
  };

  const moveBtn = async (dir: "ccw" | "cw") => {
    if (session.buttonSeat === null || activeSeats.length === 0) return;
    let next: number | null = session.buttonSeat;
    if (dir === "cw") {
      next = nextActive(session.buttonSeat, session.seatCount, activeSeats);
    } else {
      const sorted = [...activeSeats].sort((a, b) => a - b);
      const idx = sorted.indexOf(session.buttonSeat);
      next = idx <= 0 ? sorted[sorted.length - 1] : sorted[idx - 1];
    }
    if (next !== null) await Sessions.update(session.id, { buttonSeat: next });
  };

  const setHero = async (seat: number) => {
    for (const p of roster) {
      if (p.isHero && p.seat !== seat) {
        await Players.update(p.id, { isHero: false });
      }
    }
    const target = roster.find((p) => p.seat === seat);
    if (target) {
      const isPlaceholder =
        target.name.trim() === "" || target.name.trim() === "Unknown";
      await Players.update(target.id, {
        isHero: true,
        // Hero is always in the hand — bring them back from sit-out so the
        // seat re-enters activeSeats (otherwise heroSeat points at a seat the
        // hand snapshot excludes and the blind math runs off a phantom seat).
        isAway: false,
        ...(isPlaceholder ? { name: heroDefault } : {}),
      });
    }
    await Sessions.update(session.id, { heroSeat: seat });
    setShowHero(false);
  };

  // Require Hero AND the button to be on a seat that's actually active (named,
  // not sitting out). Without the activeSeats checks the user could sit out
  // the Hero or BTN, leave the pointers dangling, and Start Hand would snapshot
  // a hand whose button isn't in the seat roster → garbage blinds.
  const ready =
    session.heroSeat !== null &&
    session.buttonSeat !== null &&
    activeSeats.includes(session.heroSeat) &&
    activeSeats.includes(session.buttonSeat) &&
    activeSeats.length >= 2;

  // Precise reason the Start button is disabled, so a sat-out Hero/BTN doesn't
  // look like a frozen button.
  const notReadyReason = (): string => {
    if (activeSeats.length < 2) return "プレイヤーが2人以上必要です";
    if (session.heroSeat === null) return "Hero を選んでください";
    if (!activeSeats.includes(session.heroSeat))
      return "Hero が着席していません（空席/離席）";
    if (session.buttonSeat === null) return "BTN を選んでください";
    if (!activeSeats.includes(session.buttonSeat))
      return "BTN が着席していません（移動してください）";
    return "Hero と BTN を選んでください";
  };

  // Start a brand-new session, cloning the current stakes/seat config so the
  // common case (same game, new sit-down) is one tap. Roster resets to Unknown.
  const newSession = async () => {
    if (!session) return;
    const now = Date.now();
    const seatCount = session.seatCount;
    const created = await Sessions.create({
      date: new Date().toISOString().slice(0, 10),
      startedAt: now,
      endedAt: null,
      casino: session.casino,
      location: session.location,
      gameType: session.gameType,
      gameOther: session.gameOther,
      sb: session.sb,
      bb: session.bb,
      ante: session.ante,
      autoStraddle: session.autoStraddle,
      straddleAmount: session.straddleAmount,
      currency: session.currency,
      exchangeRate: session.exchangeRate,
      seatCount,
      rake: session.rake,
      heroSeat: null,
      buttonSeat: null,
      note: "",
    });
    for (let i = 1; i <= seatCount; i++) {
      await Players.create({
        sessionId: created.id,
        seat: i,
        name: "Unknown",
        isHero: false,
        isAway: false,
        mustPostBB: false,
        postWithAnte: false,
        stack: 200,
        note: "",
      });
    }
    nav(`/sessions/${created.id}/setup`);
  };

  const startHand = async () => {
    if (!ready) return;
    const prev = await Hands.lastForSession(session.id);
    const handNo = (prev?.handNo ?? 0) + 1;
    const seatsSnap = roster
      .filter((p) => activeSeats.includes(p.seat))
      .map((p) => ({
        seat: p.seat,
        name: p.name,
        startStack: p.stack ?? 0,
        posted: p.mustPostBB
          ? [
              { kind: "post" as const, amount: session.bb },
              // The dead post-ante a returning player owes is the same as the
              // table's BB-ante — not a fixed half-BB (which is one common
              // house rule but far from universal). If no ante is configured
              // we still skip this row even when postWithAnte is set.
              ...(p.postWithAnte && session.ante > 0
                ? [{ kind: "post_ante" as const, amount: session.ante }]
                : []),
            ]
          : [],
      }));
    const h = await Hands.create({
      sessionId: session.id,
      handNo,
      startedAt: Date.now(),
      endedAt: null,
      buttonSeat: session.buttonSeat!,
      sb: session.sb,
      bb: session.bb,
      ante: session.ante,
      autoStraddle: session.autoStraddle,
      straddleAmount: session.straddleAmount,
      seats: seatsSnap,
      board: { flop: null, turn: null, river: null },
      heroCards: null,
      result: { winners: [], wentToShowdown: false, knownCards: [] },
      pot: 0,
      rake: 0,
      note: "",
      tags: [],
      finalized: false,
    });
    for (const p of roster) {
      if (p.mustPostBB || p.postWithAnte) {
        await Players.update(p.id, { mustPostBB: false, postWithAnte: false });
      }
    }
    nav(`/sessions/${session.id}/hands/${h.id}`);
  };

  const heroPositionLabel = (() => {
    if (session.heroSeat === null) return "—";
    return positions.get(session.heroSeat) ?? `S${session.heroSeat}`;
  })();

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center px-3 py-2 border-b border-neutral-800">
        <button onClick={() => nav("/settings")} className="text-neutral-300 text-lg px-2" title="Settings">
          ⚙
        </button>
        <div className="flex-1 text-center font-bold">Session Setup</div>
        <button
          onClick={newSession}
          className="text-emerald-400 text-sm px-2"
          title="新規セッション"
        >
          ＋新規
        </button>
        <button
          onClick={() => setShowEditTable(true)}
          className="text-emerald-400 text-lg px-2"
          title="Edit Poker Table"
        >
          👥
        </button>
      </div>

      <div className="px-2 pt-2">
        <PokerTable
          totalSeats={session.seatCount}
          seats={seatsVM}
          pot={previewPot}
          streetLabel=""
          board={[null, null, null, null, null]}
          aspectRatio="16/11"
          onTapSeat={onTapSeat}
          onTapEmptySeat={onTapSeat}
          bb={session.bb}
        />
        {assignBtnMode && (
          <div className="bg-neutral-900/95 border border-neutral-800 rounded p-3 mt-2 text-center">
            <div className="text-sm font-bold">座席をタップして BTN を割り当て</div>
            <button
              onClick={() => setAssignBtnMode(false)}
              className="mt-2 px-3 py-1 bg-neutral-800 rounded text-xs"
            >
              キャンセル
            </button>
          </div>
        )}
      </div>

      <div className="p-3 space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setShowBlinds(true)}
            className="py-3 rounded bg-blue-500 font-bold text-sm"
          >
            Blinds
            <br />
            <span className="text-base">{session.sb} / {session.bb}</span>
          </button>
          <button
            onClick={async () => {
              await Sessions.update(session.id, {
                autoStraddle: !session.autoStraddle,
              });
            }}
            className={`py-3 rounded font-bold text-sm ${session.autoStraddle ? "bg-emerald-700" : "bg-neutral-700"}`}
          >
            Straddle
            <br />
            <span className="text-base">{session.autoStraddle ? "ON" : "OFF"}</span>
          </button>
          <button
            onClick={() => setShowAnte(true)}
            className={`py-3 rounded font-bold text-sm ${session.ante > 0 ? "bg-blue-700" : "bg-neutral-700"}`}
          >
            BB Ante
            <br />
            <span className="text-base">
              {session.ante > 0
                ? `${session.ante}${session.bb ? ` (${(session.ante / session.bb).toFixed(session.ante % session.bb === 0 ? 0 : 1)}BB)` : ""}`
                : "OFF"}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-xs text-neutral-400">Move BTN:</div>
          <button
            onClick={() => moveBtn("ccw")}
            className="flex-1 py-2 bg-neutral-800 rounded text-sm"
          >
            ↺ CCW
          </button>
          <button
            onClick={() => moveBtn("cw")}
            className="flex-1 py-2 bg-neutral-800 rounded text-sm"
          >
            ↻ CW
          </button>
          <button
            onClick={() => setAssignBtnMode(true)}
            className="flex-1 py-2 bg-neutral-800 rounded text-sm text-emerald-400"
          >
            ➤ Assign
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setShowAdjustAll(true)}
            className="py-2 bg-neutral-800 rounded text-sm"
          >
            Adjust All Stacks
          </button>
          <button
            onClick={() => setShowHero(true)}
            className="py-2 bg-neutral-800 rounded text-sm"
          >
            Hero: <span className="text-emerald-400 font-bold">{heroPositionLabel}</span> ▾
          </button>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label>日付</label>
              <input
                type="date"
                value={session.date}
                onChange={async (e) => {
                  await Sessions.update(session.id, { date: e.target.value });
                }}
              />
            </div>
            <div>
              <label>通貨</label>
              <select
                value={
                  knownCurrencies.includes(session.currency)
                    ? session.currency
                    : "__other"
                }
                onChange={async (e) => {
                  await Sessions.update(session.id, {
                    currency: e.target.value === "__other" ? "" : e.target.value,
                  });
                }}
              >
                {COMMON_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                {(settings?.extraCurrencies ?? []).map((c) => (
                  <option key={c} value={c}>
                    {c}（保存済）
                  </option>
                ))}
                <option value="__other">その他…</option>
              </select>
              {!knownCurrencies.includes(session.currency) && (
                <>
                  <input
                    className={`mt-1 ${session.currency.length === 3 ? "" : "border-rose-500"}`}
                    value={session.currency}
                    maxLength={3}
                    placeholder="例: THB"
                    onChange={async (e) => {
                      await Sessions.update(session.id, {
                        currency: e.target.value.toUpperCase().slice(0, 3),
                      });
                    }}
                    onBlur={async () => {
                      const c = session.currency.toUpperCase();
                      if (c.length === 3 && !knownCurrencies.includes(c)) {
                        await Settings.update({
                          extraCurrencies: [
                            ...(settings?.extraCurrencies ?? []),
                            c,
                          ],
                        });
                      }
                    }}
                  />
                  {session.currency.length !== 3 && (
                    <div className="text-[10px] text-rose-300 mt-1">
                      ISO 4217 で3文字（例: JPY, USD, THB）
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          <div>
            <label>カジノ / ロケーション</label>
            <input
              value={session.casino}
              placeholder="例: Bellagio"
              onChange={async (e) => {
                await Sessions.update(session.id, { casino: e.target.value });
              }}
            />
          </div>
          <div>
            <label>特殊ルール / セッションメモ</label>
            <textarea
              rows={2}
              value={session.note}
              placeholder="例: 7-2でボーナス、ストドラ任意、ハイハンド毎時 など"
              onChange={async (e) => {
                await Sessions.update(session.id, { note: e.target.value });
              }}
            />
          </div>
        </div>

        <button
          onClick={startHand}
          disabled={!ready}
          className={`w-full py-4 rounded font-bold text-lg ${
            ready
              ? "bg-emerald-600 hover:bg-emerald-700"
              : "bg-neutral-800 opacity-60"
          }`}
        >
          {ready ? "Start Hand ▶" : notReadyReason()}
        </button>

        {(sessionHands?.length ?? 0) > 0 && (
          <button
            onClick={() => setShowEndSession(true)}
            className="w-full py-3 mt-1 rounded font-bold text-sm bg-rose-700 hover:bg-rose-800"
          >
            🏁 セッション終了 (収支記録)
            {existingBankroll && (
              <span className="text-xs opacity-80 ml-2">（記録済 — 編集）</span>
            )}
          </button>
        )}
      </div>

      {editingSeat !== null && (() => {
        const p = roster.find((x) => x.seat === editingSeat);
        if (!p) return null;
        return (
          <PlayerEditSheet
            seat={editingSeat}
            player={p}
            bb={session.bb}
            ante={session.ante}
            suggestions={nameSuggestions ?? []}
            onClose={() => setEditingSeat(null)}
            onSave={async (patch) => {
              await Players.update(p.id, patch);
              setEditingSeat(null);
            }}
            onSitOut={async () => {
              await Players.update(p.id, { isAway: !p.isAway });
              setEditingSeat(null);
            }}
          />
        );
      })()}

      {showBlinds && (
        <BlindsSheet
          sb={session.sb}
          bb={session.bb}
          onCancel={() => setShowBlinds(false)}
          onSave={async (sb, bb) => {
            await Sessions.update(session.id, { sb, bb });
            setShowBlinds(false);
          }}
        />
      )}

      {showAnte && (
        <AnteSheet
          ante={session.ante}
          bb={session.bb}
          onCancel={() => setShowAnte(false)}
          onSave={async (ante) => {
            await Sessions.update(session.id, { ante });
            setShowAnte(false);
          }}
        />
      )}

      {showHero && (
        <HeroPositionSheet
          activeSeats={activeSeats}
          buttonSeat={session.buttonSeat}
          positions={positions}
          currentHero={session.heroSeat}
          onCancel={() => setShowHero(false)}
          onPick={setHero}
        />
      )}

      {showAdjustAll && (
        <AdjustAllSheet
          bb={session.bb}
          onCancel={() => setShowAdjustAll(false)}
          onApply={async (stack) => {
            for (const p of roster) await Players.update(p.id, { stack });
            setShowAdjustAll(false);
          }}
        />
      )}

      {showEditTable && (
        <EditTableSheet
          players={roster}
          buttonSeat={session.buttonSeat}
          positions={positions}
          suggestions={nameSuggestions ?? []}
          onClose={() => setShowEditTable(false)}
          onUpdate={async (seat, patch) => {
            const p = roster.find((x) => x.seat === seat);
            if (p) await Players.update(p.id, patch);
          }}
          onEmpty={async (seat) => {
            const p = roster.find((x) => x.seat === seat);
            if (!p) return;
            await Players.update(p.id, {
              name: "",
              stack: null,
              isHero: false,
              isAway: false,
              mustPostBB: false,
              postWithAnte: false,
            });
            if (session.heroSeat === seat)
              await Sessions.update(session.id, { heroSeat: null });
            if (session.buttonSeat === seat)
              await Sessions.update(session.id, { buttonSeat: null });
          }}
          onSwap={async (a, b) => {
            const pa = roster.find((x) => x.seat === a);
            const pb = roster.find((x) => x.seat === b);
            if (!pa || !pb) return;
            // Swap every per-player field except seat + sessionId so the
            // player carries their name, stack, Hero flag, posts, note, etc.
            // to their new chair. Hero/BTN session pointers follow.
            await Players.update(pa.id, {
              name: pb.name,
              stack: pb.stack,
              isHero: pb.isHero,
              isAway: pb.isAway,
              mustPostBB: pb.mustPostBB,
              postWithAnte: pb.postWithAnte,
              note: pb.note,
            });
            await Players.update(pb.id, {
              name: pa.name,
              stack: pa.stack,
              isHero: pa.isHero,
              isAway: pa.isAway,
              mustPostBB: pa.mustPostBB,
              postWithAnte: pa.postWithAnte,
              note: pa.note,
            });
            if (session.heroSeat === a)
              await Sessions.update(session.id, { heroSeat: b });
            else if (session.heroSeat === b)
              await Sessions.update(session.id, { heroSeat: a });
          }}
        />
      )}

      {showEndSession && (
        <BankrollEntrySheet
          mode={existingBankroll ? "edit" : "create"}
          kind="SESSION"
          baseCurrency={session.currency}
          sessions={[session]}
          initial={existingBankroll}
          onCancel={() => setShowEndSession(false)}
          onSave={async (draft) => {
            if (existingBankroll) {
              await Bankroll.update(existingBankroll.id, draft);
            } else {
              await Bankroll.create({
                ...draft,
                sessionId: session.id,
                location: draft.location || session.casino,
                stakes: draft.stakes || `${session.sb}/${session.bb}`,
                gameType: draft.gameType || session.gameType,
                currency: draft.currency || session.currency,
                buyInTotal:
                  draft.buyInTotal > 0 ? draft.buyInTotal : heroFirstStack,
                cashOut: draft.cashOut > 0 ? draft.cashOut : heroCurrentStack,
                startAt: draft.startAt ?? session.startedAt,
                endAt: draft.endAt ?? Date.now(),
              });
            }
            await Sessions.update(session.id, { endedAt: Date.now() });
            setShowEndSession(false);
            nav("/bankroll");
          }}
          onDelete={
            existingBankroll
              ? async () => {
                  await Bankroll.remove(existingBankroll.id);
                  setShowEndSession(false);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
