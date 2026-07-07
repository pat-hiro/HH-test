/**
 * Split `amount` evenly into `n` shares without losing chips to floor()
 * rounding. Works in integer cents internally (amount * 100) so a pot like
 * 1.5 split 2 ways lands as [0.75, 0.75] instead of [1.5, 0] (or [0, 0] if
 * floor()'d directly). Any leftover cent (when the split doesn't divide
 * evenly) goes one-at-a-time to the first shares, not all to the first.
 */
export function splitEvenly(amount: number, n: number): number[] {
  if (n <= 0) return [];
  const cents = Math.round(amount * 100);
  const base = Math.floor(cents / n);
  const rem = cents - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < rem ? 1 : 0)) / 100);
}
