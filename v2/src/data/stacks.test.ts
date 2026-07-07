import { describe, expect, it } from "vitest";
import {
  applySeatDeltas,
  reverseSeatDeltas,
  seatDeltas,
  type RosterStack,
  type StackChange,
} from "./stacks";

/** apply a list of stack changes onto a roster, returning the new roster —
 *  mirrors what the screens do when they persist each change. */
function merge(roster: RosterStack[], changes: StackChange[]): RosterStack[] {
  const bySeat = new Map(changes.map((c) => [c.seat, c.stack]));
  return roster.map((p) =>
    bySeat.has(p.seat) ? { ...p, stack: bySeat.get(p.seat)! } : p
  );
}

describe("seatDeltas", () => {
  it("single winner nets +pot-minus-own-spend; losers net -spend", () => {
    // S1 opens 30, S2 calls 30, S1 wins the 60 pot.
    const d = seatDeltas([{ seat: 1, amount: 60 }], { 1: 30, 2: 30 });
    expect(d).toEqual({ 1: 30, 2: -30 });
  });

  it("partial winners split the pot", () => {
    // three-way, chopped between S1 and S2, S3 folded a blind (spent 1).
    const d = seatDeltas(
      [
        { seat: 1, amount: 45 },
        { seat: 2, amount: 45 },
      ],
      { 1: 40, 2: 40, 3: 1 }
    );
    expect(d).toEqual({ 1: 5, 2: 5, 3: -1 });
  });

  it("a seat that wins exactly what it committed has delta 0", () => {
    // uncontested BB gets its own blind back (limped, everyone folded pre).
    const d = seatDeltas([{ seat: 2, amount: 2 }], { 1: 0, 2: 2 });
    expect(d[2]).toBe(0);
    expect(d[1]).toBe(0);
  });

  it("includes winners even if absent from spentTotal", () => {
    const d = seatDeltas([{ seat: 5, amount: 10 }], {});
    expect(d).toEqual({ 5: 10 });
  });
});

describe("applySeatDeltas / reverseSeatDeltas", () => {
  const roster: RosterStack[] = [
    { seat: 1, stack: 1000, startStack: 1000 },
    { seat: 2, stack: 1000, startStack: 1000 },
  ];

  it("applies won-minus-spent to the carried stacks", () => {
    const d = seatDeltas([{ seat: 1, amount: 60 }], { 1: 30, 2: 30 });
    const changes = applySeatDeltas(roster, d);
    expect(merge(roster, changes)).toEqual([
      { seat: 1, stack: 1030, startStack: 1000 },
      { seat: 2, stack: 970, startStack: 1000 },
    ]);
  });

  it("apply then reverse is the identity on tracked stacks", () => {
    const d = seatDeltas(
      [
        { seat: 1, amount: 45 },
        { seat: 2, amount: 45 },
      ],
      { 1: 40, 2: 40 }
    );
    const applied = merge(roster, applySeatDeltas(roster, d));
    const reversed = merge(applied, reverseSeatDeltas(applied, d));
    expect(reversed).toEqual(roster);
  });

  it("skips seats whose tracked stack does not move (delta 0)", () => {
    const d = seatDeltas([{ seat: 2, amount: 2 }], { 1: 0, 2: 2 });
    const changes = applySeatDeltas(roster, d);
    // both seats net 0 → no writes at all
    expect(changes).toEqual([]);
  });

  it("reverse restores the pre-finalize stacks from the post-finalize roster", () => {
    // finalize took S1 from 1000→1030, S2 1000→970. Re-open must undo exactly.
    const d = seatDeltas([{ seat: 1, amount: 60 }], { 1: 30, 2: 30 });
    const post: RosterStack[] = [
      { seat: 1, stack: 1030, startStack: 1000 },
      { seat: 2, stack: 970, startStack: 1000 },
    ];
    expect(merge(post, reverseSeatDeltas(post, d))).toEqual(roster);
  });

  it("uses startStack as the base when the carried stack is untracked (null)", () => {
    const untracked: RosterStack[] = [
      { seat: 1, stack: null, startStack: 500 },
    ];
    const d = seatDeltas([{ seat: 1, amount: 120 }], { 1: 40 });
    const changes = applySeatDeltas(untracked, d);
    expect(changes).toEqual([{ seat: 1, stack: 580 }]);
  });

  it("ignores roster seats that took no part in the hand", () => {
    const d = seatDeltas([{ seat: 1, amount: 60 }], { 1: 30, 2: 30 });
    const withBystander: RosterStack[] = [
      ...roster,
      { seat: 9, stack: 1234, startStack: 1234 },
    ];
    const changes = applySeatDeltas(withBystander, d);
    expect(changes.find((c) => c.seat === 9)).toBeUndefined();
  });
});
