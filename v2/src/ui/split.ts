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

/**
 * Deduct `rake` from a set of (side) pots proportionally, so the returned
 * amounts always sum to EXACTLY total − rake (rake is clamped to [0, total]).
 * Works in integer cents like splitEvenly. Any leftover cent from the
 * proportional floor()s — and any overflow when a tiny pot can't cover its
 * proportional share — is taken from the earliest pot that still has chips,
 * so the invariant holds even when rake exceeds the main pot alone.
 */
export function deductRake<T extends { amount: number }>(
  pots: T[],
  rake: number
): T[] {
  const cents = pots.map((p) => Math.round(p.amount * 100));
  const total = cents.reduce((a, b) => a + b, 0);
  const rakeC = Math.min(Math.max(0, Math.round(rake * 100)), total);
  if (rakeC === 0 || total === 0) return pots.map((p) => ({ ...p }));
  const cuts = cents.map((c) => Math.floor((rakeC * c) / total));
  let left = rakeC - cuts.reduce((a, b) => a + b, 0);
  for (let i = 0; left > 0 && i < cents.length; i++) {
    const take = Math.min(cents[i] - cuts[i], left);
    cuts[i] += take;
    left -= take;
  }
  return pots.map((p, i) => ({ ...p, amount: (cents[i] - cuts[i]) / 100 }));
}
