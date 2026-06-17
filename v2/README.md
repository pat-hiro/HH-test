# Poker HH v2 (rebuild)

Engine-first rewrite. The v1 app remains untouched at the repo root; v2 is a
clean rebuild that migrates only the good assets.

## Why a rebuild
v1's bugs clustered in one place: a monolithic `computeStreetState` that
recomputed turn order / pot / to-call on every render and was patched
repeatedly (blind double-post, straddle order, min-raise). Root cause: no
single source of truth for betting state, built UI-first, split across two
parallel flows.

## v2 principle
One **pure reducer** (`src/engine/reducer.ts`) is the single source of truth.
- `amount` on an Action is always the **increment** a seat adds (never a total).
- Blinds / antes / straddles / posts are **seeded deterministically** from the
  setup (`src/engine/setup.ts`), not inserted as async actions — so they can't
  double-post.
- Everything (turn, currentBet, toCall, minRaiseTo, pot, side pots, completion)
  is derived and **unit-tested** (`src/engine/reducer.test.ts`).

## Status
- [x] Phase 0 post-mortem, Phase 1–2 spec (see chat), Gates 0–2 approved
- [x] Engine: forced bets + pure reducer + 10 passing tests (incl. v1 regression)
- [ ] Data layer (Dexie, sync-ready schema: UUID / updatedAt / soft-delete)
- [ ] UI: 1.Session 2.Hand input 3.Review 4.Bankroll
- [ ] v1: Supabase sync, GTO Wizard deep-link, exports

## Dev
```
cd v2
npm install
npm test          # vitest
npm run typecheck
```
