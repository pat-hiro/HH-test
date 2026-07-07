// CSV / JSON export for the Review screen. Reads through the repo so the
// same tombstone / sort rules apply.

import { db } from "../data/db";
import { Actions, Hands, Players, Sessions } from "../data/repo";
import type { Session } from "../data/types";

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Array.from(
    rows.reduce<Set<string>>((acc, r) => {
      for (const k of Object.keys(r)) acc.add(k);
      return acc;
    }, new Set<string>())
  );
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => csvEscape(r[h])).join(","));
  return lines.join("\n");
}
function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function fileBase(s: Session | undefined): string {
  if (!s) return "hh_session";
  return `hh_${s.casino || "session"}_${s.date}`.replace(/\s+/g, "_");
}

export async function exportSessionJSON(sessionId: string): Promise<void> {
  const session = await Sessions.get(sessionId);
  const players = await Players.forSession(sessionId);
  const hands = await Hands.forSession(sessionId);
  const handIds = hands.map((h) => h.id);
  const actions = handIds.length
    ? (await db.actions.where("handId").anyOf(handIds).toArray()).filter(
        (a) => a.deletedAt === 0
      )
    : [];
  const events = handIds.length
    ? (await db.events.where("handId").anyOf(handIds).toArray()).filter(
        (e) => e.deletedAt === 0
      )
    : [];
  const payload = { session, players, hands, actions, events };
  download(`${fileBase(session)}.json`, JSON.stringify(payload, null, 2), "application/json");
}

export async function exportSessionCSV(sessionId: string): Promise<void> {
  const session = await Sessions.get(sessionId);
  const hands = await Hands.forSession(sessionId);
  const byId = new Map(hands.map((h) => [h.id, h] as const));

  const handRows = hands.map((h) => ({
    hand_no: h.handNo,
    started_at: new Date(h.startedAt).toISOString(),
    button_seat: h.buttonSeat,
    sb: h.sb,
    bb: h.bb,
    ante: h.ante,
    auto_straddle: h.autoStraddle ? 1 : 0,
    // A null slot is "not entered" → blank; UNKNOWN_CARD is stored as "?" and
    // survives as "?" so it stays distinguishable from both blanks and real
    // cards. turn/river below follow the same null→"" convention.
    board_flop:
      h.board.flop?.map((c) => c ?? "").join(" ") ?? "",
    board_turn: h.board.turn ?? "",
    board_river: h.board.river ?? "",
    pot: h.pot,
    rake: h.rake,
    winners: h.result.winners.map((w) => `S${w.seat}:${w.amount}`).join("|"),
    showdown: h.result.wentToShowdown ? 1 : 0,
    hero_cards: h.heroCards ? h.heroCards.join(" ") : "",
    note: h.note,
    tags: h.tags.join("|"),
  }));

  const allActions = await Promise.all(
    hands.map((h) =>
      Actions.forHand(h.id).then((rows) =>
        rows.map((a) => ({
          hand_no: byId.get(a.handId)?.handNo ?? "",
          order: a.order,
          street: a.street,
          seat: a.seat,
          type: a.type,
          amount: a.amount,
          all_in: a.isAllIn ? 1 : 0,
        }))
      )
    )
  );
  const actionRows = allActions.flat();

  const prefix = fileBase(session);
  download(`${prefix}_hands.csv`, toCsv(handRows), "text/csv");
  download(`${prefix}_actions.csv`, toCsv(actionRows), "text/csv");
}
