import type { RakeConfig } from "../data/types";

/**
 * Suggested rake for a pot, used only to PREFILL the optional rake input in the
 * result panel — the user can always overwrite it or clear it to 0. Applies the
 * session's percentage and cap; returns 0 when no percentage is configured or
 * the pot is empty. Time rake (RakeConfig.useTimeRake) is intentionally not
 * modelled here — it isn't a per-hand pot deduction.
 */
export function suggestedRake(pot: number, cfg: RakeConfig | undefined | null): number {
  if (!cfg || cfg.percent <= 0 || pot <= 0) return 0;
  const raw = (pot * cfg.percent) / 100;
  const capped = cfg.cap > 0 ? Math.min(raw, cfg.cap) : raw;
  // trim float noise (e.g. 0.1*3) to 2 decimals; the value is only a suggestion
  return Math.round(capped * 100) / 100;
}
