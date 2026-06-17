// ---------------------------------------------------------------------------
// Data-layer tests. We run Dexie against fake-indexeddb in Node so the same
// code paths the browser will hit are exercised here. The tests focus on the
// SYNC INVARIANTS (uuid / updatedAt monotonic / deletedAt tombstone) and on
// the integration between the data layer and the engine — these were the
// joints v1 got wrong.
// ---------------------------------------------------------------------------

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { V2Database } from "./db";
import { uuid } from "./uuid";
import {
  Actions,
  Bankroll,
  Hands,
  Players,
  Sessions,
  Settings,
} from "./repo";
import { makeSetup } from "../engine/setup";
import { computeState, simulate } from "../engine/reducer";

// the repo binds to the `db` instance exported from data/db.ts, so we
// reset that singleton's underlying IndexedDB between tests.
async function reset(): Promise<void> {
  const { db } = await import("./db");
  await db.delete();
  // re-open with the same schema
  Object.setPrototypeOf(db, V2Database.prototype);
  await db.open();
}

beforeEach(async () => {
  await reset();
});

describe("sync invariants", () => {
  it("create assigns a uuid, sets updatedAt, leaves deletedAt null", async () => {
    const s = await Sessions.create({
      date: "2026-06-17",
      startedAt: 100,
      endedAt: null,
      casino: "Bellagio",
      location: "Las Vegas",
      gameType: "NLH",
      gameOther: "",
      sb: 1,
      bb: 2,
      ante: 0,
      autoStraddle: false,
      straddleAmount: 0,
      currency: "USD",
      exchangeRate: 1,
      seatCount: 9,
      rake: {
        percent: 5,
        cap: 0,
        useTimeRake: false,
        timeAmount: 0,
        timeIntervalMin: 30,
      },
      heroSeat: null,
      buttonSeat: null,
      note: "",
    });
    expect(s.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(s.updatedAt).toBeGreaterThan(0);
    expect(s.deletedAt).toBeNull();
  });

  it("update refreshes updatedAt monotonically", async () => {
    const s = await Sessions.create(seed());
    const t1 = s.updatedAt;
    await new Promise((r) => setTimeout(r, 2));
    const updated = await Sessions.update(s.id, { casino: "Aria" });
    expect(updated!.updatedAt).toBeGreaterThan(t1);
    expect(updated!.casino).toBe("Aria");
  });

  it("remove is a soft delete (tombstone), and list() excludes tombstones", async () => {
    const s = await Sessions.create(seed());
    await Sessions.remove(s.id);
    const stillThere = await Sessions.get(s.id);
    expect(stillThere).not.toBeUndefined();
    expect(stillThere!.deletedAt).not.toBeNull();
    const visible = await Sessions.list();
    expect(visible.find((x) => x.id === s.id)).toBeUndefined();
  });
});

describe("session + players + hands wiring", () => {
  it("creates a session with roster and a hand snapshot", async () => {
    const s = await Sessions.create(seed());
    const roster = await Promise.all(
      Array.from({ length: 9 }).map((_, i) =>
        Players.create({
          sessionId: s.id,
          seat: i + 1,
          name: "Unknown",
          isHero: i === 0,
          isAway: false,
          mustPostBB: false,
          postWithAnte: false,
          stack: 200,
          note: "",
        })
      )
    );
    expect((await Players.forSession(s.id)).length).toBe(9);
    expect(roster.find((r) => r.isHero)?.seat).toBe(1);

    const h = await Hands.create({
      sessionId: s.id,
      handNo: 1,
      startedAt: 1000,
      endedAt: null,
      buttonSeat: 1,
      sb: 1,
      bb: 2,
      ante: 0,
      autoStraddle: false,
      straddleAmount: 0,
      seats: roster.map((r) => ({
        seat: r.seat,
        name: r.name,
        startStack: r.stack ?? 200,
        posted: [],
      })),
      board: { flop: null, turn: null, river: null },
      heroCards: null,
      result: { winners: [], wentToShowdown: false, knownCards: [] },
      pot: 0,
      rake: 0,
      note: "",
      tags: [],
      finalized: false,
    });
    const got = await Hands.lastForSession(s.id);
    expect(got?.id).toBe(h.id);
    expect(got?.seats.length).toBe(9);
  });
});

describe("actions: order is contiguous, UNDO pops the last one", () => {
  it("popLast removes the latest action (soft-deleted, not returned)", async () => {
    const handId = uuid();
    await Actions.bulkCreate([
      { handId, order: 0, street: "PF", seat: 4, type: "fold", amount: 0, isAllIn: false },
      { handId, order: 1, street: "PF", seat: 5, type: "raise", amount: 6, isAllIn: false },
      { handId, order: 2, street: "PF", seat: 6, type: "fold", amount: 0, isAllIn: false },
    ]);
    expect((await Actions.forHand(handId)).map((a) => a.order)).toEqual([0, 1, 2]);
    const popped = await Actions.popLast(handId);
    expect(popped?.order).toBe(2);
    const rest = await Actions.forHand(handId);
    expect(rest.map((a) => a.order)).toEqual([0, 1]);
  });
});

describe("integration: stored hand drives the engine to the right state", () => {
  it("UTG opens to 6, folds around, BB folds → handComplete with correct pot", async () => {
    const s = await Sessions.create(seed());
    const roster = await Promise.all(
      Array.from({ length: 9 }).map((_, i) =>
        Players.create({
          sessionId: s.id,
          seat: i + 1,
          name: "Unknown",
          isHero: i === 0,
          isAway: false,
          mustPostBB: false,
          postWithAnte: false,
          stack: 200,
          note: "",
        })
      )
    );
    const h = await Hands.create({
      sessionId: s.id,
      handNo: 1,
      startedAt: 1,
      endedAt: null,
      buttonSeat: 1,
      sb: 1,
      bb: 2,
      ante: 0,
      autoStraddle: false,
      straddleAmount: 0,
      seats: roster.map((r) => ({
        seat: r.seat,
        name: r.name,
        startStack: 200,
        posted: [],
      })),
      board: { flop: null, turn: null, river: null },
      heroCards: null,
      result: { winners: [], wentToShowdown: false, knownCards: [] },
      pot: 0,
      rake: 0,
      note: "",
      tags: [],
      finalized: false,
    });

    // build the engine view straight from the stored snapshot
    const setup = makeSetup({
      seats: h.seats.map((x) => ({ seat: x.seat, startStack: x.startStack })),
      seatCount: 9,
      buttonSeat: h.buttonSeat,
      sb: h.sb,
      bb: h.bb,
    });
    // engine sees no actions yet
    const pre = computeState(setup, []);
    expect(pre.currentSeat).toBe(4);

    // simulate a UTG open + everyone folds; persist the increments
    const { final, actions } = simulate(setup, [
      { seat: 4, type: "raise", to: 6 },
      { seat: 5, type: "fold" },
      { seat: 6, type: "fold" },
      { seat: 7, type: "fold" },
      { seat: 8, type: "fold" },
      { seat: 9, type: "fold" },
      { seat: 1, type: "fold" },
      { seat: 2, type: "fold" },
      { seat: 3, type: "fold" },
    ]);
    expect(final.handComplete).toBe(true);
    expect(final.inHand).toEqual([4]);
    expect(final.pot).toBe(6 + 1 + 2); // open + sb + bb

    await Actions.bulkCreate(
      actions.map((a, i) => ({
        handId: h.id,
        order: i,
        street: a.street,
        seat: a.seat,
        type: a.type,
        amount: a.amount,
        isAllIn: false,
      }))
    );
    expect((await Actions.forHand(h.id)).length).toBe(actions.length);
  });
});

describe("bankroll + settings", () => {
  it("bankroll session entry computes net = cashOut - buyInTotal", async () => {
    const sessionId = uuid();
    const e = await Bankroll.create({
      type: "SESSION",
      sessionId,
      buyInTotal: 200,
      cashOut: 350,
      startAt: 100,
      endAt: 200,
      location: "Bellagio",
      stakes: "1/3",
      gameType: "NLH",
      amount: 0,
      label: "",
      currency: "USD",
      exchangeRate: 1,
      note: "",
    });
    expect(e.cashOut - e.buyInTotal).toBe(150);
    const list = await Bankroll.list();
    expect(list.length).toBe(1);
  });

  it("Settings.get lazily creates a singleton with default presets", async () => {
    const s = await Settings.get();
    expect(s.id).toBe("singleton");
    expect(s.baseCurrency).toBe("JPY");
    expect(s.pfRaise.length).toBeGreaterThan(0);
    const s2 = await Settings.get();
    expect(s2.id).toBe(s.id); // same singleton
  });
});

// ---------------------------------------------------------------------------

function seed() {
  return {
    date: "2026-06-17",
    startedAt: 1,
    endedAt: null,
    casino: "Bellagio",
    location: "Las Vegas",
    gameType: "NLH" as const,
    gameOther: "",
    sb: 1,
    bb: 2,
    ante: 0,
    autoStraddle: false,
    straddleAmount: 0,
    currency: "USD",
    exchangeRate: 1,
    seatCount: 9,
    rake: {
      percent: 5,
      cap: 0,
      useTimeRake: false,
      timeAmount: 0,
      timeIntervalMin: 30,
    },
    heroSeat: null,
    buttonSeat: null,
    note: "",
  };
}
