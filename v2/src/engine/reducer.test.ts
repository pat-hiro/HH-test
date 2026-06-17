import { describe, it, expect } from "vitest";
import { makeSetup } from "./setup";
import { computeState, computeSidePots, simulate } from "./reducer";
import type { SeatSetup } from "./types";

const nineSeats: SeatSetup[] = Array.from({ length: 9 }, (_, i) => ({
  seat: i + 1,
  startStack: 200,
}));

function base(overrides = {}) {
  return makeSetup({
    seats: nineSeats,
    seatCount: 9,
    buttonSeat: 1,
    sb: 1,
    bb: 2,
    ...overrides,
  });
}

describe("forced bets & opening state (9-max 1/2)", () => {
  it("seeds blinds, UTG acts first, pot=3, toCall=2", () => {
    const setup = base();
    const st = computeState(setup, []);
    expect(st.street).toBe("PF");
    expect(st.pot).toBe(3); // sb1 + bb2
    expect(st.currentBet).toBe(2);
    expect(st.currentSeat).toBe(4); // UTG = seat after BB(3)
    expect(st.toCall).toBe(2);
    expect(st.minRaiseTo).toBe(4); // min open = 2bb
  });
});

describe("v1 regression: SB completing must NOT double-count the blind", () => {
  it("SB call increments to exactly the big blind, not blind+currentBet", () => {
    const setup = base();
    // fold UTG..button (seats 4,5,6,7,8,9,1), then SB completes, then BB checks
    const { states } = simulate(setup, [
      { seat: 4, type: "fold" },
      { seat: 5, type: "fold" },
      { seat: 6, type: "fold" },
      { seat: 7, type: "fold" },
      { seat: 8, type: "fold" },
      { seat: 9, type: "fold" },
      { seat: 1, type: "fold" },
      { seat: 2, type: "call" }, // SB completes
    ]);
    const afterSbCall = states[states.length - 1];
    // SB's live commitment this street must be exactly 2 (the BB), not 3
    expect(afterSbCall.liveThisStreet[2]).toBe(2);
    expect(afterSbCall.currentBet).toBe(2);
    expect(afterSbCall.currentSeat).toBe(3); // BB gets the option
    expect(afterSbCall.toCall).toBe(0);

    // BB checks → PF closes, advance to flop, pot is exactly 4
    const closed = simulate(setup, [
      { seat: 4, type: "fold" },
      { seat: 5, type: "fold" },
      { seat: 6, type: "fold" },
      { seat: 7, type: "fold" },
      { seat: 8, type: "fold" },
      { seat: 9, type: "fold" },
      { seat: 1, type: "fold" },
      { seat: 2, type: "call" },
      { seat: 3, type: "check" },
    ]).final;
    expect(closed.pot).toBe(4);
    expect(closed.street).toBe("F");
    expect(closed.currentSeat).toBe(2); // SB first to act postflop
  });
});

describe("straddle", () => {
  it("UTG straddle: action starts after straddle, min-raise is 2x straddle", () => {
    const setup = base({ autoStraddle: true }); // straddle = 2*bb = 4 on UTG(4)
    const st = computeState(setup, []);
    expect(st.currentBet).toBe(4);
    expect(st.currentSeat).toBe(5); // UTG+1 acts first
    expect(st.toCall).toBe(4);
    expect(st.minRaiseTo).toBe(8); // 2 * straddle
    expect(st.pot).toBe(1 + 2 + 4); // sb + bb + straddle
  });
});

describe("BB ante", () => {
  it("ante adds to the pot but not to the live bet", () => {
    const setup = base({ bbAnte: 2 });
    const st = computeState(setup, []);
    expect(st.pot).toBe(1 + 2 + 2); // sb + bb + ante
    expect(st.currentBet).toBe(2); // ante is dead, current bet is still the BB
    expect(st.toCall).toBe(2); // UTG still only owes the BB
    expect(st.currentSeat).toBe(4);
  });
});

describe("post (returning player)", () => {
  it("a post plays as a live BB-sized bet and adds to the pot", () => {
    const setup = base({ posts: [{ seat: 7, amount: 2 }] });
    const st = computeState(setup, []);
    expect(st.pot).toBe(1 + 2 + 2); // sb + bb + post
    expect(st.currentBet).toBe(2);
  });

  it("post with 0.5BB ante adds a dead chip on top", () => {
    const setup = base({ posts: [{ seat: 7, amount: 2, ante: 1 }] });
    const st = computeState(setup, []);
    expect(st.pot).toBe(1 + 2 + 2 + 1); // sb + bb + post + post-ante
    expect(st.currentBet).toBe(2);
  });
});

describe("hand ends when everyone folds to one player", () => {
  it("folds around to BB → hand complete, BB is the only seat left", () => {
    const setup = base();
    const { final } = simulate(setup, [
      { seat: 4, type: "fold" },
      { seat: 5, type: "fold" },
      { seat: 6, type: "fold" },
      { seat: 7, type: "fold" },
      { seat: 8, type: "fold" },
      { seat: 9, type: "fold" },
      { seat: 1, type: "fold" },
      { seat: 2, type: "fold" }, // SB folds too
    ]);
    expect(final.handComplete).toBe(true);
    expect(final.inHand).toEqual([3]);
    expect(final.pot).toBe(3); // sb1 + bb2
  });
});

describe("side pots", () => {
  it("layers contributions into main + side pots with correct eligibility", () => {
    // three all-in contributions of 20 / 50 / 100, nobody folded
    const pots = computeSidePots({ 1: 100, 2: 20, 3: 50 }, new Set());
    expect(pots).toEqual([
      { amount: 60, eligible: [1, 2, 3] }, // 20 * 3
      { amount: 60, eligible: [1, 3] }, // 30 * 2
      { amount: 50, eligible: [1] }, // 50 * 1
    ]);
    const total = pots.reduce((s, p) => s + p.amount, 0);
    expect(total).toBe(170);
  });

  it("excludes folded seats from eligibility but keeps their chips in the pot", () => {
    const pots = computeSidePots({ 1: 50, 2: 50, 3: 50 }, new Set([2]));
    // one pot of 150, only seats 1 and 3 eligible
    expect(pots).toEqual([{ amount: 150, eligible: [1, 3] }]);
  });
});

describe("a normal multiway street resolves correctly", () => {
  it("UTG opens to 6, two calls, blinds fold → flop with pot 20", () => {
    const setup = base();
    const { final } = simulate(setup, [
      { seat: 4, type: "raise", to: 6 }, // UTG opens to 6
      { seat: 5, type: "fold" },
      { seat: 6, type: "call" }, // calls 6
      { seat: 7, type: "fold" },
      { seat: 8, type: "fold" },
      { seat: 9, type: "fold" },
      { seat: 1, type: "fold" },
      { seat: 2, type: "fold" }, // SB folds (loses 1)
      { seat: 3, type: "fold" }, // BB folds (loses 2)
    ]);
    // pot = UTG 6 + caller 6 + sb 1 + bb 2 = 15... wait BB folded its 2 stays
    expect(final.pot).toBe(6 + 6 + 1 + 2);
    expect(final.handComplete).toBe(false);
    expect(final.street).toBe("F");
  });
});

describe("v2 regression: action moves clockwise from the most recent actor", () => {
  it("right after UTG limps + UTG+1 raises, action is on UTG+2 — NOT the limper", () => {
    const setup = base(); // 9-max, BTN=1, SB=2, BB=3, UTG=4
    const { states } = simulate(setup, [
      { seat: 4, type: "call" }, // UTG limps
      { seat: 5, type: "raise", to: 6 }, // UTG+1 raises
    ]);
    const after = states[states.length - 1];
    expect(after.currentSeat).toBe(6); // UTG+2, the next seat after the raiser
    expect(after.toCall).toBe(6);
    expect(after.streetComplete).toBe(false);
  });

  it("right after the BB closes, action goes back to the LIMPER (not skipped to flop)", () => {
    const setup = base(); // 9-max, BTN seat 1 → SB=2, BB=3, UTG=4
    // UTG(4) limps, UTG+1(5) raises to 6
    let st = computeState(setup, []);
    // sanity
    expect(st.currentSeat).toBe(4);

    const { states } = simulate(setup, [
      { seat: 4, type: "call" }, // UTG limps (call 2)
      { seat: 5, type: "raise", to: 6 }, // UTG+1 raises to 6
      { seat: 6, type: "fold" },
      { seat: 7, type: "fold" },
      { seat: 8, type: "fold" },
      { seat: 9, type: "fold" },
      { seat: 1, type: "call" }, // BTN calls 6
      { seat: 2, type: "fold" }, // SB folds
      { seat: 3, type: "call" }, // BB calls 6
    ]);
    const afterBbCall = states[states.length - 1];
    // The limper at seat 4 has live = 2 (limp), currentBet = 6.
    // They MUST get to act again: call 4 more or fold or 3-bet.
    expect(afterBbCall.currentSeat).toBe(4);
    expect(afterBbCall.streetComplete).toBe(false);
    expect(afterBbCall.toCall).toBe(4);
  });

  it("BB has the standard option when PF is unraised (limped pot)", () => {
    const setup = base();
    const { states } = simulate(setup, [
      { seat: 4, type: "call" }, // UTG limps
      { seat: 5, type: "fold" },
      { seat: 6, type: "fold" },
      { seat: 7, type: "fold" },
      { seat: 8, type: "fold" },
      { seat: 9, type: "fold" },
      { seat: 1, type: "fold" }, // BTN folds
      { seat: 2, type: "call" }, // SB completes
    ]);
    const afterSb = states[states.length - 1];
    // BB still has the option to check or raise
    expect(afterSb.currentSeat).toBe(3);
    expect(afterSb.toCall).toBe(0);
  });

  it("after the limper folds, the street completes and we advance to flop", () => {
    const setup = base();
    const { final } = simulate(setup, [
      { seat: 4, type: "call" },
      { seat: 5, type: "raise", to: 6 },
      { seat: 6, type: "fold" },
      { seat: 7, type: "fold" },
      { seat: 8, type: "fold" },
      { seat: 9, type: "fold" },
      { seat: 1, type: "call" },
      { seat: 2, type: "fold" },
      { seat: 3, type: "call" },
      { seat: 4, type: "fold" }, // limper folds to the raise
    ]);
    expect(final.street).toBe("F");
    expect(final.streetComplete).toBe(false); // postflop: someone is to act on the flop
  });
});
