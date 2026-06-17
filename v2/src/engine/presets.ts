// Pure helper used by the bet/raise sheet. Keeps the rounding rule in one
// place so the displayed preset value always equals the submitted value.

import type { BetPreset } from "../data/types-presets";

export interface PresetCtx {
  bb: number;
  /** total pot at the moment the preset is evaluated */
  pot: number;
  /** chips needed to call (raise increment from the current actor's view) */
  toCall: number;
  /** straddle amount (0 = no straddle) */
  straddleAmount: number;
  /** the bet level the current actor must MATCH this street — what "prev"
   *  basis multiplies against. PF unraised: BB. PF after open: opener's
   *  amount. Postflop: the bet to call. */
  currentBet: number;
}

export function computePresetAmount(p: BetPreset, ctx: PresetCtx): number {
  let v = 0;
  switch (p.basis) {
    case "prev":
      v = (ctx.currentBet || ctx.bb) * p.multiplier;
      break;
    case "bb":
      v = ctx.bb * p.multiplier;
      break;
    case "str":
      v = (ctx.straddleAmount || ctx.bb * 2) * p.multiplier;
      break;
    case "pot":
      v = ctx.pot * p.multiplier;
      break;
    case "call":
      v = ctx.toCall * p.multiplier;
      break;
  }
  return Math.round(v);
}
