// Pure helper used by the bet/raise sheet. Keeps the rounding rule in one
// place so the displayed preset value always equals the submitted value.

import type { BetPreset } from "../data/types-presets";

export interface PresetCtx {
  bb: number;
  pot: number;
  toCall: number;
  straddleAmount: number; // 0 = no straddle
}

export function computePresetAmount(p: BetPreset, ctx: PresetCtx): number {
  let v = 0;
  switch (p.basis) {
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
