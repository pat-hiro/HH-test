import { describe, expect, it } from "vitest";
import { computePresetAmount } from "./presets";

describe("computePresetAmount", () => {
  const baseCtx = { bb: 2, pot: 17, toCall: 6, straddleAmount: 4, currentBet: 6 };

  it("rounds bb-basis to integer", () => {
    expect(computePresetAmount({ label: "2.5x", multiplier: 2.5, basis: "bb" }, baseCtx)).toBe(5);
  });
  it("uses straddle amount for str-basis", () => {
    expect(computePresetAmount({ label: "3x STR", multiplier: 3, basis: "str" }, baseCtx)).toBe(12);
  });
  it("falls back to 2*bb when no straddle", () => {
    const noStr = { ...baseCtx, straddleAmount: 0 };
    expect(computePresetAmount({ label: "2x STR", multiplier: 2, basis: "str" }, noStr)).toBe(8);
  });
  it("computes pot-basis from current pot", () => {
    expect(computePresetAmount({ label: "1/3", multiplier: 1 / 3, basis: "pot" }, baseCtx)).toBe(6);
    expect(computePresetAmount({ label: "POT", multiplier: 1, basis: "pot" }, baseCtx)).toBe(17);
  });
  it("computes call-basis from toCall", () => {
    expect(computePresetAmount({ label: "3x", multiplier: 3, basis: "call" }, baseCtx)).toBe(18);
  });

  describe('"prev" basis: 3x means "3x the previous bet/raise"', () => {
    it("PF open: prev = BB (currentBet=2) → 3x = 6", () => {
      const open = { ...baseCtx, currentBet: 2 };
      expect(
        computePresetAmount({ label: "3x", multiplier: 3, basis: "prev" }, open)
      ).toBe(6);
    });
    it("PF 3-bet: prev = opener's amount (currentBet=6) → 3x = 18", () => {
      const threebet = { ...baseCtx, currentBet: 6 };
      expect(
        computePresetAmount({ label: "3x", multiplier: 3, basis: "prev" }, threebet)
      ).toBe(18);
    });
    it("PF 4-bet: prev = 3-bet amount (currentBet=18) → 3x = 54", () => {
      const fourbet = { ...baseCtx, currentBet: 18 };
      expect(
        computePresetAmount({ label: "3x", multiplier: 3, basis: "prev" }, fourbet)
      ).toBe(54);
    });
    it("Postflop raise: prev = bet size (currentBet=10) → 2.5x = 25", () => {
      const pfopRaise = { ...baseCtx, currentBet: 10 };
      expect(
        computePresetAmount({ label: "2.5x", multiplier: 2.5, basis: "prev" }, pfopRaise)
      ).toBe(25);
    });
    it("Falls back to BB if currentBet is 0 (defensive)", () => {
      const noBet = { ...baseCtx, currentBet: 0 };
      expect(
        computePresetAmount({ label: "3x", multiplier: 3, basis: "prev" }, noBet)
      ).toBe(6);
    });
  });
});
