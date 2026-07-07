import { describe, expect, it } from "vitest";
import { splitEvenly } from "./split";

describe("splitEvenly", () => {
  it("splits an evenly-divisible pot with no remainder", () => {
    expect(splitEvenly(100, 2)).toEqual([50, 50]);
    expect(splitEvenly(90, 3)).toEqual([30, 30, 30]);
  });
  it("distributes a whole-chip remainder one at a time instead of dumping it on seat 0", () => {
    expect(splitEvenly(10, 3)).toEqual([3.34, 3.33, 3.33]);
  });
  it("handles fractional (0.5BB) pots without floor()-ing to zero", () => {
    expect(splitEvenly(1.5, 2)).toEqual([0.75, 0.75]);
    expect(splitEvenly(0.5, 2)).toEqual([0.25, 0.25]);
  });
  it("always sums back to the original amount", () => {
    for (const [amount, n] of [[1.5, 2], [10, 3], [7.5, 4], [100, 7]] as const) {
      const shares = splitEvenly(amount, n);
      const total = shares.reduce((a, b) => a + b, 0);
      expect(Math.round(total * 100) / 100).toBe(amount);
    }
  });
  it("returns an empty array for zero or negative n", () => {
    expect(splitEvenly(100, 0)).toEqual([]);
    expect(splitEvenly(100, -1)).toEqual([]);
  });
});
