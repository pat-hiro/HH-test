// ---------------------------------------------------------------------------
// v2 data model — sync-ready from day one.
//
// Every persisted entity carries:
//   id        : UUID v4 (string) — stable across devices, generated locally
//   updatedAt : epoch ms          — last-write timestamp (used for sync merges)
//   deletedAt : epoch ms | null   — soft-delete tombstone (never hard-delete)
//
// This shape lets us swap Dexie for Supabase in v1 with no migration:
// every row already has the keys a cloud merge needs.
// ---------------------------------------------------------------------------

import type { Street } from "../engine/types";

export interface Syncable {
  id: string;
  updatedAt: number;
  deletedAt: number | null;
}

// ---------------------------------------------------------------------------
// Session — one continuous play period at a table.
// ---------------------------------------------------------------------------

export type GameType = "NLH" | "PLO" | "PLO5" | "OTHER";

export interface RakeConfig {
  percent: number; // 0..100
  cap: number; // 0 = no cap
  useTimeRake: boolean;
  timeAmount: number;
  timeIntervalMin: number;
}

export interface Session extends Syncable {
  date: string; // YYYY-MM-DD
  startedAt: number;
  endedAt: number | null;
  casino: string;
  location: string; // free text city/room label, used by bankroll
  gameType: GameType;
  gameOther: string; // when gameType=OTHER
  sb: number;
  bb: number;
  ante: number; // BB-ante amount (dead); 0 = none
  autoStraddle: boolean;
  straddleAmount: number; // 0 = default 2*bb
  currency: string; // ISO 4217 (JPY, USD, ...)
  exchangeRate: number; // ratio to bankroll's base currency at session time
  seatCount: number; // 2..11
  rake: RakeConfig;
  heroSeat: number | null;
  buttonSeat: number | null;
  note: string;
}

// ---------------------------------------------------------------------------
// SessionPlayer — roster snapshot for a session (one row per seat).
// Names/stacks etc. for individual hands are snapshotted INTO each Hand,
// so renaming a roster player later doesn't rewrite past hands.
// ---------------------------------------------------------------------------

export interface SessionPlayer extends Syncable {
  sessionId: string;
  seat: number;
  name: string; // "" = empty seat, "Unknown" = anonymous
  isHero: boolean;
  isAway: boolean; // sit-out
  mustPostBB: boolean; // returning-player post for next hand
  postWithAnte: boolean; // adds +0.5BB dead on top of post
  stack: number | null; // current carried stack; null = not tracked
  note: string;
}

// ---------------------------------------------------------------------------
// Hand — one full hand. Stakes, blinds, and seat roster are SNAPSHOTTED so a
// hand is fully self-describing even if the session changes later.
// ---------------------------------------------------------------------------

export interface HandSeatSnapshot {
  seat: number;
  name: string;
  startStack: number;
  /** any forced bets the seat owed at the start of this hand (post etc.) */
  posted: { kind: "post" | "post_ante"; amount: number }[];
}

export interface HandResult {
  /** seat → chips won (may include split share). Empty until the hand is finalized. */
  winners: { seat: number; amount: number }[];
  wentToShowdown: boolean;
  knownCards: { seat: number; cards: [string, string] }[];
}

export interface Hand extends Syncable {
  sessionId: string;
  handNo: number; // 1-based within session
  startedAt: number;
  endedAt: number | null;
  buttonSeat: number;
  // stakes snapshot
  sb: number;
  bb: number;
  ante: number;
  autoStraddle: boolean;
  straddleAmount: number;
  // roster snapshot — only active seats are listed
  seats: HandSeatSnapshot[];
  board: {
    /** Each slot is independently optional — the user may remember some flop
     *  cards but not others. A fully empty flop is stored as null. */
    flop: [string | null, string | null, string | null] | null;
    turn: string | null;
    river: string | null;
  };
  heroCards: [string, string] | null;
  result: HandResult;
  pot: number; // total pot at the moment of finalization (incl. dead chips)
  rake: number;
  note: string;
  tags: string[];
  finalized: boolean;
}

// ---------------------------------------------------------------------------
// Action — one voluntary action by a seat. Amount is always an INCREMENT.
// Forced bets (blinds/ante/straddle/post) are NOT stored as actions — they
// live on the Hand snapshot and are seeded by the engine setup at runtime.
// ---------------------------------------------------------------------------

export interface Action extends Syncable {
  handId: string;
  order: number; // 0-based, contiguous
  street: Street;
  seat: number;
  type: "fold" | "check" | "call" | "bet" | "raise" | "allin";
  amount: number; // chip increment (0 for fold/check)
  isAllIn: boolean;
}

// ---------------------------------------------------------------------------
// HandEvent — non-action records: notes, exposed cards, misdeal markers.
// ---------------------------------------------------------------------------

export type EventType = "NOTE" | "EXPOSED_CARD" | "MISDEAL";

export interface HandEvent extends Syncable {
  handId: string;
  street: Street | null;
  type: EventType;
  seat: number | null;
  cards: string[];
  note: string;
  resolution: string; // misdeal / play continues / card replaced / ""
}

// ---------------------------------------------------------------------------
// BankrollEntry — screen 4. A row is either a session P&L or a stand-alone
// transaction (top-up, withdrawal). Hand-level P&L for a session is derived
// from that session's hands, not stored here.
// ---------------------------------------------------------------------------

export type BankrollEntryType = "SESSION" | "TRANSACTION";

export interface BankrollEntry extends Syncable {
  type: BankrollEntryType;
  // session-linked (type=SESSION)
  sessionId: string | null;
  buyInTotal: number;
  cashOut: number;
  startAt: number | null;
  endAt: number | null;
  location: string;
  stakes: string; // "1/2", "5/10", etc.
  gameType: GameType | "";
  // stand-alone (type=TRANSACTION)
  amount: number; // signed; positive = deposit, negative = withdrawal
  label: string;
  // common
  currency: string;
  exchangeRate: number;
  note: string;
}

// ---------------------------------------------------------------------------
// AppSettings — single-row preferences (bet-size presets, base currency, etc).
// ---------------------------------------------------------------------------

import type { BetPreset } from "./types-presets";

export interface AppSettings extends Syncable {
  baseCurrency: string; // e.g. "JPY"
  /** Default display name used whenever a seat becomes Hero and its previous
   *  name was a placeholder ("" or "Unknown"). User-visible in Settings. */
  heroDefaultName: string;
  pfRaise: BetPreset[];
  pfRaiseStraddle: BetPreset[];
  postflopBet: BetPreset[];
  postflopRaise: BetPreset[];
}
