export const RANKS = [
  "A",
  "K",
  "Q",
  "J",
  "T",
  "9",
  "8",
  "7",
  "6",
  "5",
  "4",
  "3",
  "2",
] as const;
export const SUITS = ["s", "h", "d", "c"] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];

export function suitSymbol(s: string): string {
  switch (s) {
    case "s":
      return "♠";
    case "h":
      return "♥";
    case "d":
      return "♦";
    case "c":
      return "♣";
    default:
      return "?";
  }
}

export function suitColor(s: string): string {
  if (s === "h" || s === "d") return "text-red-400";
  return "text-neutral-100";
}

export function parseCard(c: string): { rank: string; suit: string } | null {
  if (c.length !== 2) return null;
  return { rank: c[0], suit: c[1] };
}

export function formatCard(c: string): string {
  const p = parseCard(c);
  if (!p) return c;
  return `${p.rank}${suitSymbol(p.suit)}`;
}
