import { db } from "../db/db";

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
  for (const r of rows) {
    lines.push(headers.map((h) => csvEscape(r[h])).join(","));
  }
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

export async function exportSessionJSON(sessionId: number) {
  const session = await db.sessions.get(sessionId);
  const players = await db.players.where({ sessionId }).toArray();
  const hands = await db.hands.where({ sessionId }).toArray();
  const handIds = hands.map((h) => h.id).filter((x): x is number => x !== undefined);
  const actions = handIds.length
    ? await db.actions.where("handId").anyOf(handIds).toArray()
    : [];
  const events = handIds.length
    ? await db.events.where("handId").anyOf(handIds).toArray()
    : [];
  const payload = { session, players, hands, actions, events };
  const name = `hh_${session?.casino ?? "session"}_${session?.date ?? ""}.json`.replace(
    /\s+/g,
    "_"
  );
  download(name, JSON.stringify(payload, null, 2), "application/json");
}

export async function exportSessionCSV(sessionId: number) {
  const session = await db.sessions.get(sessionId);
  const hands = await db.hands.where({ sessionId }).toArray();
  const handIds = hands.map((h) => h.id).filter((x): x is number => x !== undefined);
  const actions = handIds.length
    ? await db.actions.where("handId").anyOf(handIds).toArray()
    : [];
  const events = handIds.length
    ? await db.events.where("handId").anyOf(handIds).toArray()
    : [];

  const handRows = hands.map((h) => ({
    hand_no: h.handNo,
    started_at: new Date(h.startedAt).toISOString(),
    button_seat: h.buttonSeat,
    sb: h.sb,
    bb: h.bb,
    ante: h.ante,
    board_flop: h.board.flop?.join(" ") ?? "",
    board_turn: h.board.turn ?? "",
    board_river: h.board.river ?? "",
    pot: h.pot,
    rake: h.rake,
    winners: h.winners.map((w) => `S${w.seat}:${w.amount}`).join("|"),
    showdown: h.wentToShowdown ? 1 : 0,
    note: h.note,
  }));

  const handByDbId = new Map<number, number>();
  for (const h of hands) if (h.id !== undefined) handByDbId.set(h.id, h.handNo);

  const actionRows = actions.map((a) => ({
    hand_no: handByDbId.get(a.handId) ?? "",
    order: a.order,
    street: a.street,
    seat: a.seat,
    type: a.type,
    amount: a.amount,
    all_in: a.isAllIn ? 1 : 0,
  }));
  const eventRows = events.map((e) => ({
    hand_no: handByDbId.get(e.handId) ?? "",
    type: e.type,
    street: e.street ?? "",
    seat: e.seat ?? "",
    cards: e.cards.join(" "),
    resolution: e.resolution,
    note: e.note,
  }));

  const prefix = `hh_${session?.casino ?? "session"}_${session?.date ?? ""}`.replace(
    /\s+/g,
    "_"
  );
  download(`${prefix}_hands.csv`, toCsv(handRows), "text/csv");
  download(`${prefix}_actions.csv`, toCsv(actionRows), "text/csv");
  download(`${prefix}_events.csv`, toCsv(eventRows), "text/csv");
}
