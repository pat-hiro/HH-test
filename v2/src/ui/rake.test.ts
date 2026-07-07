import { describe, expect, it } from "vitest";
import type { RakeConfig } from "../data/types";
import { suggestedRake } from "./rake";

const cfg = (over: Partial<RakeConfig>): RakeConfig => ({
  percent: 0,
  cap: 0,
  useTimeRake: false,
  timeAmount: 0,
  timeIntervalMin: 0,
  ...over,
});

describe("suggestedRake", () => {
  it("returns 0 when no percentage is configured", () => {
    expect(suggestedRake(100, cfg({ percent: 0 }))).toBe(0);
  });
  it("returns 0 for an empty or non-positive pot", () => {
    expect(suggestedRake(0, cfg({ percent: 5 }))).toBe(0);
    expect(suggestedRake(-10, cfg({ percent: 5 }))).toBe(0);
  });
  it("returns 0 for a missing config", () => {
    expect(suggestedRake(100, undefined)).toBe(0);
    expect(suggestedRake(100, null)).toBe(0);
  });
  it("applies the percentage when uncapped (cap=0)", () => {
    expect(suggestedRake(100, cfg({ percent: 5, cap: 0 }))).toBe(5);
    expect(suggestedRake(250, cfg({ percent: 10, cap: 0 }))).toBe(25);
  });
  it("caps the rake at the configured cap", () => {
    expect(suggestedRake(1000, cfg({ percent: 5, cap: 30 }))).toBe(30);
    // below the cap → uncapped percentage
    expect(suggestedRake(200, cfg({ percent: 5, cap: 30 }))).toBe(10);
  });
  it("trims floating-point noise to 2 decimals", () => {
    expect(suggestedRake(30, cfg({ percent: 1 }))).toBe(0.3);
    expect(suggestedRake(33, cfg({ percent: 1 }))).toBe(0.33);
  });
});
