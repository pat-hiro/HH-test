export const RANKS = [
  "A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2",
] as const;
export const SUITS = ["s", "h", "d", "c"] as const;

/**
 * Sentinel for a board slot the user deliberately marks as "unknown" — they
 * saw a card was dealt but can't recall which. A single "?" can never collide
 * with a real card (those are always the 2-char rank+suit, e.g. "As"). A slot
 * still holding `null` means "not entered yet"; UNKNOWN_CARD means "entered,
 * but unknown". Unlike a real card, an UNKNOWN_CARD is NOT consumed from the
 * used-card set (see isRealCard) since it removes no specific card from play.
 */
export const UNKNOWN_CARD = "?";

/** True only for concrete rank+suit cards — excludes null and UNKNOWN_CARD.
 *  Use to build the "used" set and any exclude list that must not block real
 *  ranks/suits on account of an unknown board slot. */
export function isRealCard(c: string | null | undefined): c is string {
  return !!c && c !== UNKNOWN_CARD;
}

export function suitSymbol(s: string): string {
  switch (s) {
    case "s": return "♠";
    case "h": return "♥";
    case "d": return "♦";
    case "c": return "♣";
    default: return "?";
  }
}

export function suitColor(s: string): string {
  return s === "h" || s === "d" ? "text-red-500" : "text-neutral-900";
}
