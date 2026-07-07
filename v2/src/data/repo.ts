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

/** alive-row sentinel — see Syncable comment + db.ts upgrade for the why. */
export const ALIVE = 0;

/** mint a new row: id, updatedAt, deletedAt are set by the repo, not callers */
export function newRow<T extends Syncable>(
  data: Omit<T, "id" | "updatedAt" | "deletedAt"> & Partial<Pick<T, "id">>
): T {
  const t = now();
  return {
    ...(data as object),
    id: data.id ?? uuid(),
    updatedAt: t,
    deletedAt: ALIVE,
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

/** Read-modify-write inside ONE transaction. Without it the get→put gap lets
 *  two concurrent updates to different fields read the same base row and the
 *  later put silently drop the earlier field (e.g. the result autosave racing
 *  a note save). Dexie serializes rw transactions that share a table, so each
 *  update merges onto the other's committed row instead. */
async function updateRow<T extends Syncable>(
  table: Table<T, string>,
  id: string,
  patch: Partial<Omit<T, "id">>
): Promise<T | null> {
  return db.transaction("rw", table, async () => {
    const existing = await table.get(id);
    if (!existing) return null;
    const next = { ...existing, ...patch, updatedAt: now() } as T;
    await table.put(next);
    return next;
  });
}

/** Same transaction wrapper as updateRow — a concurrent update must never
 *  read the pre-delete row and put it back alive (tombstone resurrection). */
async function softDelete<T extends Syncable>(
  table: Table<T, string>,
  id: string
): Promise<void> {
  return db.transaction("rw", table, async () => {
    const existing = await table.get(id);
    if (!existing) return;
    await table.put({ ...existing, deletedAt: now(), updatedAt: now() });
  });
}

/** Index-seek the alive rows directly (deletedAt === 0). Replaces the v1
 *  "scan everything and JS-filter tombstones" pattern. */
async function listAlive<T extends Syncable>(
  table: Table<T, string>
): Promise<T[]> {
  return table.where("deletedAt").equals(ALIVE).toArray();
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
      .where("[sessionId+deletedAt]")
      .equals([sessionId, ALIVE])
      .toArray();
    return rows.sort((a, b) => a.seat - b.seat);
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
    const rows = await db.hands
      .where("[sessionId+deletedAt]")
      .equals([sessionId, ALIVE])
      .toArray();
    return rows.sort((a, b) => a.handNo - b.handNo);
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
  /**
   * Append one action, assigning `order` atomically from the DB's current max
   * INSIDE a transaction. Callers must NOT pass `order` — deriving it from a
   * (possibly stale) liveQuery snapshot is what let two rapid taps collide on
   * the same order and corrupt the replay. Dexie serializes rw transactions
   * that share a table, so concurrent appends get sequential orders.
   */
  append: async (
    data: Omit<Action, "id" | "updatedAt" | "deletedAt" | "order">
  ): Promise<Action> =>
    db.transaction("rw", db.actions, async () => {
      const rows = await db.actions
        .where("[handId+deletedAt]")
        .equals([data.handId, ALIVE])
        .toArray();
      const maxOrder = rows.reduce((m, r) => Math.max(m, r.order), -1);
      const row = newRow<Action>({ ...data, order: maxOrder + 1 });
      await db.actions.put(row);
      return row;
    }),
  /** Append several actions in one transaction, numbering them sequentially
   *  from the current max order. Same atomicity guarantee as `append`. */
  appendMany: async (
    handId: string,
    rows: Omit<Action, "id" | "updatedAt" | "deletedAt" | "order" | "handId">[]
  ): Promise<Action[]> =>
    db.transaction("rw", db.actions, async () => {
      const existing = await db.actions
        .where("[handId+deletedAt]")
        .equals([handId, ALIVE])
        .toArray();
      let next = existing.reduce((m, r) => Math.max(m, r.order), -1) + 1;
      const built = rows.map((r) =>
        newRow<Action>({ ...r, handId, order: next++ })
      );
      await db.actions.bulkPut(built);
      return built;
    }),
  remove: (id: string) => softDelete<Action>(db.actions, id),
  forHand: async (handId: string): Promise<Action[]> => {
    const rows = await db.actions
      .where("[handId+deletedAt]")
      .equals([handId, ALIVE])
      .toArray();
    return rows.sort((a, b) => a.order - b.order);
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
    const rows = await db.events
      .where("[handId+deletedAt]")
      .equals([handId, ALIVE])
      .toArray();
    return rows.sort((a, b) => a.updatedAt - b.updatedAt);
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
    const rows = await db.bankroll
      .where("[sessionId+deletedAt]")
      .equals([sessionId, ALIVE])
      .toArray();
    return rows[0];
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
  // "prev" multiplies the bet level that must be matched: BB on an open
  // (currentBet = BB), the open size on a 3-bet (currentBet = open), the
  // 3-bet size on a 4-bet, etc. Same multiplier works at every depth.
  pfRaise: [
    { label: "2x", multiplier: 2, basis: "prev" },
    { label: "2.5x", multiplier: 2.5, basis: "prev" },
    { label: "3x", multiplier: 3, basis: "prev" },
    { label: "4x", multiplier: 4, basis: "prev" },
  ],
  pfRaiseStraddle: [
    { label: "2x", multiplier: 2, basis: "prev" },
    { label: "2.5x", multiplier: 2.5, basis: "prev" },
    { label: "3x", multiplier: 3, basis: "prev" },
  ],
  postflopBet: [
    { label: "1/3", multiplier: 0.33, basis: "pot" },
    { label: "1/2", multiplier: 0.5, basis: "pot" },
    { label: "2/3", multiplier: 0.66, basis: "pot" },
    { label: "POT", multiplier: 1, basis: "pot" },
  ],
  postflopRaise: [
    { label: "2.5x", multiplier: 2.5, basis: "prev" },
    { label: "3x", multiplier: 3, basis: "prev" },
    { label: "4x", multiplier: 4, basis: "prev" },
  ],
};

/** Read-only — safe to call inside useLiveQuery. Returns defaults if the
 * singleton hasn't been persisted yet; persistence happens lazily on the
 * first call to Settings.update(). */
export const Settings = {
  get: async (): Promise<AppSettings> => {
    const existing = await db.settings.get(SETTINGS_ID);
    if (existing) {
      // back-fill defaults so older singletons (saved before fields
      // existed) don't blow up with `undefined`
      return {
        ...existing,
        heroDefaultName: existing.heroDefaultName || "Hero",
        extraCurrencies: existing.extraCurrencies ?? [],
      };
    }
    return {
      id: SETTINGS_ID,
      updatedAt: 0,
      deletedAt: ALIVE,
      baseCurrency: "JPY",
      heroDefaultName: "Hero",
      extraCurrencies: [],
      ...DEFAULT_PRESETS,
    };
  },
  update: async (patch: Partial<Omit<AppSettings, "id">>): Promise<AppSettings> => {
    const existing = await db.settings.get(SETTINGS_ID);
    const base: AppSettings = existing
      ? {
          ...existing,
          heroDefaultName: existing.heroDefaultName || "Hero",
          extraCurrencies: existing.extraCurrencies ?? [],
        }
      : {
          id: SETTINGS_ID,
          updatedAt: 0,
          deletedAt: ALIVE,
          baseCurrency: "JPY",
          heroDefaultName: "Hero",
          extraCurrencies: [],
          ...DEFAULT_PRESETS,
        };
    const next = { ...base, ...patch, updatedAt: now() };
    await db.settings.put(next);
    return next;
  },
};
