import { describe, expect, it } from "vitest";
import { computePresetAmount } from "./presets";

describe("computePresetAmount", () => {
  const ctx = { bb: 2, pot: 17, toCall: 6, straddleAmount: 4 };

  it("rounds bb-basis to integer", () => {
    expect(computePresetAmount({ label: "2.5x", multiplier: 2.5, basis: "bb" }, ctx)).toBe(5);
  });
  it("uses straddle amount for str-basis", () => {
    expect(computePresetAmount({ label: "3x STR", multiplier: 3, basis: "str" }, ctx)).toBe(12);
  });
  it("falls back to 2*bb when no straddle", () => {
    const noStr = { ...ctx, straddleAmount: 0 };
    expect(computePresetAmount({ label: "2x STR", multiplier: 2, basis: "str" }, noStr)).toBe(8);
  });
  it("computes pot-basis from current pot", () => {
    expect(computePresetAmount({ label: "1/3", multiplier: 1 / 3, basis: "pot" }, ctx)).toBe(6);
    expect(computePresetAmount({ label: "POT", multiplier: 1, basis: "pot" }, ctx)).toBe(17);
  });
  it("computes call-basis from toCall", () => {
    expect(computePresetAmount({ label: "3x", multiplier: 3, basis: "call" }, ctx)).toBe(18);
  });
});
