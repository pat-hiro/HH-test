// ---------------------------------------------------------------------------
// Dexie schema. All tables are UUID-keyed and carry updatedAt + deletedAt so
// we can swap to Supabase later by replaying the rows with the same keys.
//
// deletedAt = 0 means "alive"; a positive value is the tombstone timestamp.
// We need a non-null sentinel so the alive-rows queries can actually USE the
// secondary index — IndexedDB doesn't index null keys, so the v1 schema's
// `deletedAt: null` forced every list query to load the table into memory
// and JS-filter. The v2 schema upgrade rewrites those nulls to 0 and adds
// the [sessionId+deletedAt] / [handId+deletedAt] compound indexes so the hot
// per-scope queries seek straight to the alive rows.
// ---------------------------------------------------------------------------

import Dexie from "dexie";
import type { Table } from "dexie";
import type {
  Action,
  AppSettings,
  BankrollEntry,
  Hand,
  HandEvent,
  Session,
  SessionPlayer,
} from "./types";

export class V2Database extends Dexie {
  sessions!: Table<Session, string>;
  sessionPlayers!: Table<SessionPlayer, string>;
  hands!: Table<Hand, string>;
  actions!: Table<Action, string>;
  events!: Table<HandEvent, string>;
  bankroll!: Table<BankrollEntry, string>;
  settings!: Table<AppSettings, string>;

  constructor(name = "hh_v2") {
    super(name);
    // v1 — original schema. deletedAt was nullable, so its index was useless
    // for the "alive rows" query (Dexie/IndexedDB can't index null keys) and
    // every read scanned the table in memory.
    this.version(1).stores({
      sessions: "id, startedAt, deletedAt",
      sessionPlayers: "id, sessionId, [sessionId+seat], deletedAt",
      hands: "id, sessionId, [sessionId+handNo], startedAt, deletedAt",
      actions: "id, handId, [handId+order], deletedAt",
      events: "id, handId, deletedAt",
      bankroll: "id, startAt, sessionId, deletedAt",
      settings: "id",
    });
    // v2 — `deletedAt` is now a non-null number (0 = alive). Compound indexes
    // on the hot per-scope reads turn them into real index seeks.
    this.version(2)
      .stores({
        sessions: "id, startedAt, deletedAt",
        sessionPlayers: "id, sessionId, [sessionId+seat], [sessionId+deletedAt], deletedAt",
        hands: "id, sessionId, [sessionId+handNo], [sessionId+deletedAt], startedAt, deletedAt",
        actions: "id, handId, [handId+order], [handId+deletedAt], deletedAt",
        events: "id, handId, [handId+deletedAt], deletedAt",
        bankroll: "id, startAt, sessionId, [sessionId+deletedAt], deletedAt",
        settings: "id",
      })
      .upgrade(async (tx) => {
        // Rewrite every existing row's deletedAt from null → 0 so the new
        // indexes actually contain the alive rows. Tombstones (any positive
        // timestamp) are left alone. Explicit read-then-put because Dexie's
        // .modify() doesn't reliably persist the mutation across all engines
        // (including fake-indexeddb in our test suite).
        const tables = [
          "sessions",
          "sessionPlayers",
          "hands",
          "actions",
          "events",
          "bankroll",
        ] as const;
        for (const t of tables) {
          const table = tx.table(t);
          const rows = await table.toArray();
          for (const row of rows) {
            if (row.deletedAt == null) {
              await table.put({ ...row, deletedAt: 0 });
            }
          }
        }
      });
  }
}

export const db = new V2Database();
