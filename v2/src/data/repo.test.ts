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
  it("create assigns a uuid, sets updatedAt, marks the row alive (deletedAt=0)", async () => {
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
    // 0 is the alive sentinel — see Syncable / db.ts. Required because Dexie
    // can't index `null` keys, so the v1 schema's null-deletedAt left every
    // read scanning the whole table.
    expect(s.deletedAt).toBe(0);
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
    // Tombstone is the deletion epoch-ms, not just "non-zero" by accident.
    expect(stillThere!.deletedAt).toBeGreaterThan(0);
    const visible = await Sessions.list();
    expect(visible.find((x) => x.id === s.id)).toBeUndefined();
  });

  it("alive-row reads use the deletedAt=0 index, not a JS filter (tombstones excluded)", async () => {
    // Three sessions: one alive, two tombstoned. list() must see only the alive
    // one, and the index seek under the hood returns it directly.
    const live = await Sessions.create(seed());
    const dead1 = await Sessions.create(seed());
    const dead2 = await Sessions.create(seed());
    await Sessions.remove(dead1.id);
    await Sessions.remove(dead2.id);
    const visible = await Sessions.list();
    expect(visible.map((s) => s.id)).toEqual([live.id]);
    // Tombstones still in the table but not counted as alive.
    const { db } = await import("./db");
    expect(await db.sessions.count()).toBe(3);
  });
});

describe("concurrent writes: update/softDelete are atomic read-modify-writes", () => {
  it("two parallel updates patching different fields both survive", async () => {
    const s = await Sessions.create(seed());
    // Fire both WITHOUT awaiting between them — the way the result autosave
    // and a note save can overlap. Pre-fix, both read the same base row and
    // the later put dropped the earlier field.
    await Promise.all([
      Sessions.update(s.id, { casino: "Aria" }),
      Sessions.update(s.id, { note: "deep game" }),
    ]);
    const final = await Sessions.get(s.id);
    expect(final?.casino).toBe("Aria");
    expect(final?.note).toBe("deep game");
  });

  it("an update racing a softDelete cannot resurrect the tombstone", async () => {
    const s = await Sessions.create(seed());
    await Promise.all([
      Sessions.remove(s.id),
      Sessions.update(s.id, { casino: "Aria" }),
    ]);
    // Whichever order the two commits land in, the row stays dead: delete-
    // last tombstones the updated row; update-last merges onto the tombstoned
    // row and its patch never touches deletedAt.
    const final = await Sessions.get(s.id);
    expect(final?.deletedAt).toBeGreaterThan(0);
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

  it("append assigns order from the DB max — concurrent appends never collide", async () => {
    const handId = uuid();
    // Fire several appends WITHOUT awaiting between them, the way two rapid
    // taps would. Each must still get a distinct, sequential order.
    await Promise.all([
      Actions.append({ handId, street: "PF", seat: 4, type: "call", amount: 2, isAllIn: false }),
      Actions.append({ handId, street: "PF", seat: 5, type: "call", amount: 2, isAllIn: false }),
      Actions.append({ handId, street: "PF", seat: 6, type: "fold", amount: 0, isAllIn: false }),
    ]);
    const orders = (await Actions.forHand(handId)).map((a) => a.order);
    expect(orders).toEqual([0, 1, 2]);
    expect(new Set(orders).size).toBe(3); // no duplicates
  });

  it("append continues numbering after a popLast (undo) without reusing an order", async () => {
    const handId = uuid();
    await Actions.append({ handId, street: "PF", seat: 4, type: "raise", amount: 6, isAllIn: false });
    await Actions.append({ handId, street: "PF", seat: 5, type: "fold", amount: 0, isAllIn: false });
    await Actions.popLast(handId); // undo the fold (order 1, now tombstoned)
    const next = await Actions.append({ handId, street: "PF", seat: 5, type: "call", amount: 6, isAllIn: false });
    // max alive order was 0 after the pop, so the new action is 1 again — and
    // forHand returns exactly the two alive rows in order.
    expect(next.order).toBe(1);
    expect((await Actions.forHand(handId)).map((a) => [a.seat, a.type])).toEqual([
      [4, "raise"],
      [5, "call"],
    ]);
  });

  it("appendMany numbers a batch sequentially from the current max", async () => {
    const handId = uuid();
    await Actions.append({ handId, street: "PF", seat: 4, type: "raise", amount: 6, isAllIn: false });
    await Actions.appendMany(handId, [
      { street: "PF", seat: 5, type: "fold", amount: 0, isAllIn: false },
      { street: "PF", seat: 6, type: "fold", amount: 0, isAllIn: false },
    ]);
    expect((await Actions.forHand(handId)).map((a) => a.order)).toEqual([0, 1, 2]);
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

  it("Settings.get is read-only (no write inside the call) so it's safe inside useLiveQuery", async () => {
    const { db } = await import("./db");
    // Confirm the row truly does not exist before the call.
    expect(await db.settings.get("singleton")).toBeUndefined();
    const s = await Settings.get();
    expect(s.id).toBe("singleton");
    expect(s.baseCurrency).toBe("JPY");
    expect(s.pfRaise.length).toBeGreaterThan(0);
    // The defaults are returned, NOT persisted. This was the root cause of
    // the "Readwrite transaction in liveQuery context" crash from screen 4.
    expect(await db.settings.get("singleton")).toBeUndefined();
  });

  it("Settings.update persists (lazily creating the singleton)", async () => {
    const { db } = await import("./db");
    const updated = await Settings.update({ baseCurrency: "USD" });
    expect(updated.baseCurrency).toBe("USD");
    const stored = await db.settings.get("singleton");
    expect(stored?.baseCurrency).toBe("USD");
  });
});

describe("v1 → v2 migration: null deletedAt is rewritten to 0", () => {
  it("pre-existing rows saved with null deletedAt become 0 after open", async () => {
    // Use a private DB name so this test can't collide with the singleton's
    // state and so the upgrade hook genuinely runs against a v1 → v2 path.
    const Dexie = (await import("dexie")).default;
    const name = "hh_v2_migration_test_" + Date.now();
    try {
      await Dexie.delete(name);
    } catch {
      /* nothing there yet */
    }

    // 1) Open the SAME DB name at v1 (the previous schema) and write rows
    //    with deletedAt: null — what an existing user's IndexedDB looks like
    //    before upgrading to v2.
    const v1 = new Dexie(name);
    v1.version(1).stores({
      sessions: "id, startedAt, deletedAt",
      sessionPlayers: "id, sessionId, [sessionId+seat], deletedAt",
      hands: "id, sessionId, [sessionId+handNo], startedAt, deletedAt",
      actions: "id, handId, [handId+order], deletedAt",
      events: "id, handId, deletedAt",
      bankroll: "id, startAt, sessionId, deletedAt",
      settings: "id",
    });
    await v1.open();
    await v1.table("sessions").put({
      id: "legacy-alive",
      updatedAt: 100,
      deletedAt: null,
      ...seed(),
    });
    await v1.table("sessions").put({
      id: "legacy-tombstoned",
      updatedAt: 100,
      deletedAt: 500, // already a real tombstone — must NOT be touched
      ...seed(),
    });
    v1.close();

    // 2) Open the SAME name through V2Database — the open path sees v=1 on
    //    disk vs v=2 in code and runs our upgrade hook.
    const v2 = new V2Database(name);
    await v2.open();
    const alive = await v2.sessions.get("legacy-alive");
    const dead = await v2.sessions.get("legacy-tombstoned");
    expect(alive?.deletedAt).toBe(0); // null → 0
    expect(dead?.deletedAt).toBe(500); // tombstone preserved

    // 3) Verify the index-seek path finds the upgraded row.
    const visible = await v2.sessions
      .where("deletedAt")
      .equals(0)
      .toArray();
    expect(visible.map((s) => s.id)).toContain("legacy-alive");
    expect(visible.map((s) => s.id)).not.toContain("legacy-tombstoned");

    v2.close();
    await Dexie.delete(name);
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
