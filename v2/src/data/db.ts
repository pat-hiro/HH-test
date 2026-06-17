// ---------------------------------------------------------------------------
// Dexie schema (v1). All tables are UUID-keyed and carry updatedAt + deletedAt
// so we can swap to Supabase later by replaying the rows with the same keys.
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
    this.version(1).stores({
      // primary key = id (uuid). Secondary indexes for hot queries:
      sessions: "id, startedAt, deletedAt",
      sessionPlayers: "id, sessionId, [sessionId+seat], deletedAt",
      hands: "id, sessionId, [sessionId+handNo], startedAt, deletedAt",
      actions: "id, handId, [handId+order], deletedAt",
      events: "id, handId, deletedAt",
      bankroll: "id, startAt, sessionId, deletedAt",
      settings: "id",
    });
  }
}

export const db = new V2Database();
