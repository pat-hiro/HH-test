export type Street = "PF" | "F" | "T" | "R";

export type ActionType =
  | "FOLD"
  | "CHECK"
  | "CALL"
  | "BET"
  | "RAISE"
  | "ALL_IN"
  | "POST"
  | "BLIND_SB"
  | "BLIND_BB"
  | "ANTE"
  | "STRADDLE";

export type PostKind = "SB" | "BB" | "SB_BB" | "DEAD";

export type EventType = "EXPOSED_CARD" | "MISDEAL" | "NOTE";

export interface SessionTemplate {
  id?: number;
  name: string;
  casino: string;
  game: string;
  stakesLabel: string;
  sb: number;
  bb: number;
  ante: number;
  rake: string;
  seats: number;
}

export interface Session {
  id?: number;
  startedAt: number;
  endedAt?: number;
  date: string;
  casino: string;
  game: string;
  stakesLabel: string;
  sb: number;
  bb: number;
  ante: number;
  rake: string;
  tableLabel: string;
  seats: number;
  heroSeat: number | null;
  note: string;
  buttonSeat: number | null;
  autoStraddle: boolean;
  straddleSeats: number[];
}

export interface Player {
  id?: number;
  sessionId: number;
  seat: number;
  name: string;
  isHero: boolean;
  isAway: boolean;
  mustPostSB: boolean;
  mustPostBB: boolean;
  stack?: number;
  note: string;
  joinedAt: number;
  leftAt?: number;
}

export interface Action {
  id?: number;
  handId: number;
  order: number;
  street: Street;
  seat: number;
  type: ActionType;
  amount: number;
  totalPutIn: number;
  isAllIn: boolean;
}

export interface HandEvent {
  id?: number;
  handId: number;
  street: Street | null;
  type: EventType;
  seat: number | null;
  cards: string[];
  note: string;
  resolution: string;
  createdAt: number;
}

export interface Board {
  flop: [string, string, string] | null;
  turn: string | null;
  river: string | null;
}

export interface PotShare {
  seat: number;
  amount: number;
  showdownHand?: string;
}

export interface Hand {
  id?: number;
  sessionId: number;
  handNo: number;
  startedAt: number;
  endedAt?: number;
  buttonSeat: number;
  sb: number;
  bb: number;
  ante: number;
  activeSeats: number[];
  board: Board;
  pot: number;
  rake: number;
  winners: PotShare[];
  wentToShowdown: boolean;
  note: string;
  finalized: boolean;
}
