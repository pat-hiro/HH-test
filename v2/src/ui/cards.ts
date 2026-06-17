export const RANKS = [
  "A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2",
] as const;
export const SUITS = ["s", "h", "d", "c"] as const;

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
