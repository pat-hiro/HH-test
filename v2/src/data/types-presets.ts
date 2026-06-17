/**
 * A bet/raise preset basis.
 * - "prev": multiplier of the previous bet/raise amount (engine: currentBet).
 *   This is the standard poker meaning of "3x" for opens and re-raises:
 *   PF unraised currentBet = BB, so 3x = 3 BB. After an open to 6, currentBet
 *   = 6, so 3x for the 3-bet = 18 (3x the opener). After a 3-bet to 18,
 *   currentBet = 18, so 3x for the 4-bet = 54. Same on postflop raises.
 * - "pot": multiplier of the current pot (for opens / postflop bets).
 * - "call": multiplier of the chips needed to call (the raise increment).
 * - "bb": absolute multiple of the big blind. Kept for back-compat / niche use.
 * - "str": absolute multiple of the straddle amount.
 */
export interface BetPreset {
  label: string;
  multiplier: number;
  basis: "prev" | "pot" | "call" | "bb" | "str";
}
