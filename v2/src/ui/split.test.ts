import { describe, expect, it } from "vitest";
import { deductRake, splitEvenly } from "./split";

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

describe("deductRake (G3)", () => {
  it("deducts rake from a single main pot so the total is exactly total - rake", () => {
    const pots = [{ amount: 100, eligible: [1, 2] }];
    const result = deductRake(pots, 10);
    expect(result).toEqual([{ amount: 90, eligible: [1, 2] }]);
  });

  it("a rake larger than the main pot spills the deduction into side pots but still sums to exactly total - rake", () => {
    // main pot (20) alone can't cover the 45 rake — the excess must be cut
    // from the side pots too, which is the case a prior version got wrong.
    const pots = [
      { amount: 20, eligible: [1, 2, 3] },
      { amount: 30, eligible: [1, 3] },
      { amount: 50, eligible: [1] },
    ];
    const rake = 45;
    const result = deductRake(pots, rake);
    const total = result.reduce((s, p) => s + p.amount, 0);
    expect(Math.round(total * 100) / 100).toBe(55); // 100 - 45
    for (const p of result) expect(p.amount).toBeGreaterThanOrEqual(0);
    // eligibility is untouched — only amounts change
    expect(result.map((p) => p.eligible)).toEqual(pots.map((p) => p.eligible));
  });

  it("rake=0 leaves pots unchanged; rake exceeding the total is clamped so the sum never goes negative", () => {
    const pots = [{ amount: 10 }, { amount: 20 }];
    expect(deductRake(pots, 0)).toEqual(pots.map((p) => ({ ...p })));

    const over = deductRake(pots, 1000);
    const total = over.reduce((s, p) => s + p.amount, 0);
    expect(total).toBe(0);
    for (const p of over) expect(p.amount).toBeGreaterThanOrEqual(0);
  });

  it("splits the rake across equal pots in whole cents, with any leftover cent going to the earliest pot", () => {
    const pots = [{ amount: 10 }, { amount: 10 }, { amount: 10 }];
    const result = deductRake(pots, 1);
    expect(result).toEqual([{ amount: 9.66 }, { amount: 9.67 }, { amount: 9.67 }]);
    const total = result.reduce((s, p) => s + p.amount, 0);
    expect(Math.round(total * 100) / 100).toBe(29);
  });
});
