import { describe, expect, it } from "vitest";
import { fmtChips } from "./fmt";

describe("fmtChips", () => {
  it("formats small integers as-is", () => {
    expect(fmtChips(0)).toBe("0");
    expect(fmtChips(2)).toBe("2");
    expect(fmtChips(99)).toBe("99");
  });
  it("rounds 3-digit to whole numbers", () => {
    expect(fmtChips(123)).toBe("123");
    expect(fmtChips(999)).toBe("999");
  });
  it("uses k for thousands", () => {
    expect(fmtChips(1000)).toBe("1k");
    expect(fmtChips(1500)).toBe("1.5k");
    expect(fmtChips(12345)).toBe("12.3k");
    expect(fmtChips(123456)).toBe("123k");
  });
  it("uses M for millions", () => {
    expect(fmtChips(1_000_000)).toBe("1M");
    expect(fmtChips(1_500_000)).toBe("1.5M");
    expect(fmtChips(12_300_000)).toBe("12.3M");
  });
  it("carries a round-up into the next unit instead of showing 1000k", () => {
    expect(fmtChips(999_950)).toBe("1M");
    expect(fmtChips(999_499)).toBe("999k");
  });
  it("keeps decimals for sub-100 values", () => {
    expect(fmtChips(0.5)).toBe("0.5");
    expect(fmtChips(2.5)).toBe("2.5");
    expect(fmtChips(12.34)).toBe("12.34");
  });
  it("preserves sign", () => {
    expect(fmtChips(-150)).toBe("-150");
    expect(fmtChips(-1500)).toBe("-1.5k");
  });
});
