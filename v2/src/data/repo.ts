// ---------------------------------------------------------------------------
// Repository — the ONLY allowed place to read/write the db. Every write goes
// through createRow/updateRow/softDelete so that:
//   - id is always a UUID
//   - updatedAt is always refreshed on write
//   - deletedAt acts as a tombstone (we never physically delete)
//   - list queries filter out tombstoned rows by default
//
// This keeps sync invariants intact even when many callers touch the db.
// ---------------------------------------------------------------------------

import type { Table } from "dexie";
import { db } from "./db";
import { uuid } from "./uuid";
import type {
  Action,
  AppSettings,
  BankrollEntry,
  Hand,
  HandEvent,
  Session,
  SessionPlayer,
  Syncable,
} from "./types";
import type { BetPreset } from "./types-presets";

export function now(): number {
  return Date.now();
}

/** mint a new row: id, updatedAt, deletedAt are set by the repo, not callers */
export function newRow<T extends Syncable>(
  data: Omit<T, "id" | "updatedAt" | "deletedAt"> & Partial<Pick<T, "id">>
): T {
  const t = now();
  return {
    ...(data as object),
    id: data.id ?? uuid(),
    updatedAt: t,
    deletedAt: null,
  } as T;
}

async function createRow<T extends Syncable>(
  table: Table<T, string>,
  data: Omit<T, "id" | "updatedAt" | "deletedAt"> & Partial<Pick<T, "id">>
): Promise<T> {
  const row = newRow<T>(data);
  await table.put(row);
  return row;
}

async function updateRow<T extends Syncable>(
  table: Table<T, string>,
  id: string,
  patch: Partial<Omit<T, "id">>
): Promise<T | null> {
  const existing = await table.get(id);
  if (!existing) return null;
  const next = { ...existing, ...patch, updatedAt: now() } as T;
  await table.put(next);
  return next;
}

async function softDelete<T extends Syncable>(
  table: Table<T, string>,
  id: string
): Promise<void> {
  const existing = await table.get(id);
  if (!existing) return;
  await table.put({ ...existing, deletedAt: now(), updatedAt: now() });
}

async function listAlive<T extends Syncable>(
  table: Table<T, string>
): Promise<T[]> {
  const all = await table.toArray();
  return all.filter((r) => r.deletedAt === null);
}

// ---------------------------------------------------------------------------
// Public repos
// ---------------------------------------------------------------------------

export const Sessions = {
  create: (data: Omit<Session, "id" | "updatedAt" | "deletedAt">) =>
    createRow<Session>(db.sessions, data),
  update: (id: string, patch: Partial<Omit<Session, "id">>) =>
    updateRow<Session>(db.sessions, id, patch),
  remove: (id: string) => softDelete<Session>(db.sessions, id),
  get: (id: string) => db.sessions.get(id),
  list: async (): Promise<Session[]> => {
    const all = await listAlive<Session>(db.sessions);
    return all.sort((a, b) => b.startedAt - a.startedAt);
  },
  latest: async (): Promise<Session | undefined> => {
    const all = await listAlive<Session>(db.sessions);
    return all.sort((a, b) => b.startedAt - a.startedAt)[0];
  },
};

export const Players = {
  create: (data: Omit<SessionPlayer, "id" | "updatedAt" | "deletedAt">) =>
    createRow<SessionPlayer>(db.sessionPlayers, data),
  update: (id: string, patch: Partial<Omit<SessionPlayer, "id">>) =>
    updateRow<SessionPlayer>(db.sessionPlayers, id, patch),
  remove: (id: string) => softDelete<SessionPlayer>(db.sessionPlayers, id),
  forSession: async (sessionId: string): Promise<SessionPlayer[]> => {
    const rows = await db.sessionPlayers
      .where("sessionId")
      .equals(sessionId)
      .toArray();
    return rows
      .filter((r) => r.deletedAt === null)
      .sort((a, b) => a.seat - b.seat);
  },
};

export const Hands = {
  create: (data: Omit<Hand, "id" | "updatedAt" | "deletedAt">) =>
    createRow<Hand>(db.hands, data),
  update: (id: string, patch: Partial<Omit<Hand, "id">>) =>
    updateRow<Hand>(db.hands, id, patch),
  remove: (id: string) => softDelete<Hand>(db.hands, id),
  get: (id: string) => db.hands.get(id),
  forSession: async (sessionId: string): Promise<Hand[]> => {
    const rows = await db.hands.where("sessionId").equals(sessionId).toArray();
    return rows
      .filter((r) => r.deletedAt === null)
      .sort((a, b) => a.handNo - b.handNo);
  },
  lastForSession: async (sessionId: string): Promise<Hand | undefined> => {
    const list = await Hands.forSession(sessionId);
    return list[list.length - 1];
  },
};

export const Actions = {
  create: (data: Omit<Action, "id" | "updatedAt" | "deletedAt">) =>
    createRow<Action>(db.actions, data),
  bulkCreate: async (
    rows: Omit<Action, "id" | "updatedAt" | "deletedAt">[]
  ): Promise<Action[]> => {
    const built = rows.map((r) => newRow<Action>(r));
    await db.actions.bulkPut(built);
    return built;
  },
  remove: (id: string) => softDelete<Action>(db.actions, id),
  forHand: async (handId: string): Promise<Action[]> => {
    const rows = await db.actions.where("handId").equals(handId).toArray();
    return rows
      .filter((r) => r.deletedAt === null)
      .sort((a, b) => a.order - b.order);
  },
  /** delete the last (highest-order) action of a hand — used by UNDO */
  popLast: async (handId: string): Promise<Action | null> => {
    const all = await Actions.forHand(handId);
    if (all.length === 0) return null;
    const last = all[all.length - 1];
    await softDelete<Action>(db.actions, last.id);
    return last;
  },
};

export const Events = {
  create: (data: Omit<HandEvent, "id" | "updatedAt" | "deletedAt">) =>
    createRow<HandEvent>(db.events, data),
  forHand: async (handId: string): Promise<HandEvent[]> => {
    const rows = await db.events.where("handId").equals(handId).toArray();
    return rows
      .filter((r) => r.deletedAt === null)
      .sort((a, b) => a.updatedAt - b.updatedAt);
  },
  remove: (id: string) => softDelete<HandEvent>(db.events, id),
};

export const Bankroll = {
  create: (data: Omit<BankrollEntry, "id" | "updatedAt" | "deletedAt">) =>
    createRow<BankrollEntry>(db.bankroll, data),
  update: (id: string, patch: Partial<Omit<BankrollEntry, "id">>) =>
    updateRow<BankrollEntry>(db.bankroll, id, patch),
  remove: (id: string) => softDelete<BankrollEntry>(db.bankroll, id),
  list: async (): Promise<BankrollEntry[]> => {
    const all = await listAlive<BankrollEntry>(db.bankroll);
    return all.sort((a, b) => (b.startAt ?? 0) - (a.startAt ?? 0));
  },
  forSession: async (sessionId: string): Promise<BankrollEntry | undefined> => {
    const all = await listAlive<BankrollEntry>(db.bankroll);
    return all.find((b) => b.sessionId === sessionId);
  },
};

// ---------------------------------------------------------------------------
// Settings — exactly one row, lazily created with sane defaults.
// ---------------------------------------------------------------------------

const SETTINGS_ID = "singleton";

const DEFAULT_PRESETS: {
  pfRaise: BetPreset[];
  pfRaiseStraddle: BetPreset[];
  postflopBet: BetPreset[];
  postflopRaise: BetPreset[];
} = {
  pfRaise: [
    { label: "2x", multiplier: 2, basis: "bb" },
    { label: "2.5x", multiplier: 2.5, basis: "bb" },
    { label: "3x", multiplier: 3, basis: "bb" },
    { label: "4x", multiplier: 4, basis: "bb" },
  ],
  pfRaiseStraddle: [
    { label: "2x STR", multiplier: 2, basis: "str" },
    { label: "2.5x STR", multiplier: 2.5, basis: "str" },
    { label: "3x STR", multiplier: 3, basis: "str" },
  ],
  postflopBet: [
    { label: "1/3", multiplier: 0.33, basis: "pot" },
    { label: "1/2", multiplier: 0.5, basis: "pot" },
    { label: "2/3", multiplier: 0.66, basis: "pot" },
    { label: "POT", multiplier: 1, basis: "pot" },
  ],
  postflopRaise: [
    { label: "2.5x", multiplier: 2.5, basis: "call" },
    { label: "3x", multiplier: 3, basis: "call" },
    { label: "4x", multiplier: 4, basis: "call" },
  ],
};

export const Settings = {
  get: async (): Promise<AppSettings> => {
    const existing = await db.settings.get(SETTINGS_ID);
    if (existing) return existing;
    const fresh: AppSettings = {
      id: SETTINGS_ID,
      updatedAt: now(),
      deletedAt: null,
      baseCurrency: "JPY",
      ...DEFAULT_PRESETS,
    };
    await db.settings.put(fresh);
    return fresh;
  },
  update: async (patch: Partial<Omit<AppSettings, "id">>): Promise<AppSettings> => {
    const current = await Settings.get();
    const next = { ...current, ...patch, updatedAt: now() };
    await db.settings.put(next);
    return next;
  },
};
