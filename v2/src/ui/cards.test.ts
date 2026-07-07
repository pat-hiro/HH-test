import { describe, expect, it } from "vitest";
import { UNKNOWN_CARD, isRealCard } from "./cards";

describe("isRealCard", () => {
  it("accepts concrete rank+suit cards", () => {
    expect(isRealCard("As")).toBe(true);
    expect(isRealCard("Td")).toBe(true);
    expect(isRealCard("2c")).toBe(true);
  });
  it("rejects an unentered (null/undefined) slot", () => {
    expect(isRealCard(null)).toBe(false);
    expect(isRealCard(undefined)).toBe(false);
  });
  it("rejects the UNKNOWN_CARD sentinel — it consumes no specific card", () => {
    expect(isRealCard(UNKNOWN_CARD)).toBe(false);
    expect(UNKNOWN_CARD).toBe("?");
  });
  it("filters a mixed board down to only the real cards", () => {
    const board = ["As", null, UNKNOWN_CARD, "Kh", null];
    expect(board.filter(isRealCard)).toEqual(["As", "Kh"]);
  });
});
