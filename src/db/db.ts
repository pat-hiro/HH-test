import Dexie from "dexie";
import type { Table } from "dexie";
import type {
  Action,
  Hand,
  HandEvent,
  Player,
  Session,
  SessionTemplate,
} from "./types";

export class HHDatabase extends Dexie {
  sessions!: Table<Session, number>;
  templates!: Table<SessionTemplate, number>;
  players!: Table<Player, number>;
  hands!: Table<Hand, number>;
  actions!: Table<Action, number>;
  events!: Table<HandEvent, number>;

  constructor() {
    super("hh_db");
    this.version(1).stores({
      sessions: "++id, startedAt, casino",
      templates: "++id, name",
      players: "++id, sessionId, seat, name",
      hands: "++id, sessionId, handNo, startedAt",
      actions: "++id, handId, order, street, seat",
      events: "++id, handId, street, type",
    });
  }
}

export const db = new HHDatabase();
