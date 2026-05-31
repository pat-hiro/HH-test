import Dexie from "dexie";
import type { Table } from "dexie";
import type {
  Action,
  BetSettings,
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
  betSettings!: Table<BetSettings, number>;

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
    this.version(2).stores({
      sessions: "++id, startedAt, casino",
      templates: "++id, name",
      players: "++id, sessionId, seat, name",
      hands: "++id, sessionId, handNo, startedAt",
      actions: "++id, handId, order, street, seat",
      events: "++id, handId, street, type",
      betSettings: "++id",
    });
  }
}

export const db = new HHDatabase();

export const DEFAULT_BET_SETTINGS: BetSettings = {
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
    { label: "4x STR", multiplier: 4, basis: "str" },
  ],
  postflopBet: [
    { label: "1/3 pot", multiplier: 0.33, basis: "pot" },
    { label: "1/2 pot", multiplier: 0.5, basis: "pot" },
    { label: "2/3 pot", multiplier: 0.66, basis: "pot" },
    { label: "POT", multiplier: 1, basis: "pot" },
  ],
  postflopRaise: [
    { label: "2.5x", multiplier: 2.5, basis: "call" },
    { label: "3x", multiplier: 3, basis: "call" },
    { label: "4x", multiplier: 4, basis: "call" },
  ],
};

export async function getBetSettings(): Promise<BetSettings> {
  const row = await db.betSettings.toCollection().first();
  if (row) return row;
  const id = await db.betSettings.add({ ...DEFAULT_BET_SETTINGS });
  return { ...DEFAULT_BET_SETTINGS, id };
}
