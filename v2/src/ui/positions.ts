const LABELS: Record<number, string[]> = {
  2: ["BTN", "BB"],
  3: ["BTN", "SB", "BB"],
  4: ["BTN", "SB", "BB", "UTG"],
  5: ["BTN", "SB", "BB", "UTG", "CO"],
  6: ["BTN", "SB", "BB", "UTG", "HJ", "CO"],
  7: ["BTN", "SB", "BB", "UTG", "+1", "HJ", "CO"],
  8: ["BTN", "SB", "BB", "UTG", "+1", "LJ", "HJ", "CO"],
  9: ["BTN", "SB", "BB", "UTG", "+1", "+2", "LJ", "HJ", "CO"],
  10: ["BTN", "SB", "BB", "UTG", "+1", "+2", "+3", "LJ", "HJ", "CO"],
  11: ["BTN", "SB", "BB", "UTG", "+1", "+2", "+3", "+4", "LJ", "HJ", "CO"],
};

export function positionLabels(
  activeSeats: number[],
  btnSeat: number | null
): Map<number, string> {
  const map = new Map<number, string>();
  if (btnSeat === null) return map;
  const sorted = [...activeSeats].sort((a, b) => a - b);
  const n = sorted.length;
  const idx = sorted.indexOf(btnSeat);
  if (idx < 0) return map;
  const order = LABELS[n] ?? LABELS[9];
  for (let i = 0; i < n; i++) {
    map.set(sorted[(idx + i) % n], order[i] ?? "");
  }
  return map;
}

/**
 * Push seats away from the right and left horizontal midlines so adjacent
 * seats on the curved ends have more vertical breathing room. The offset
 * uses sin(2θ) — which gives the right "split apart" direction near θ=0 and
 * θ=180 — multiplied by cos²(θ). The cos² factor zeroes out the offset at
 * the top and bottom of the oval (where the seats need horizontal room, not
 * vertical), so the spread doesn't crowd seats around the bottom curve when
 * total ≥ 10 puts several seats there.
 *
 * Without the cos² damping, sin(2θ) was pulling bottom-curve seats TOWARD
 * the bottom-centre — the 10-handed S5&S6 and 11-handed S5&S6&S7 crowding
 * the user reported.
 */
function landscapeSpread(angleDeg: number, total: number): number {
  if (total <= 6) return angleDeg;
  const alpha = total <= 8 ? 0.15 : 0.2;
  const r = (angleDeg * Math.PI) / 180;
  const damp = Math.cos(r) * Math.cos(r); // 1 at horizontal midlines, 0 at top/bottom
  return angleDeg + alpha * damp * Math.sin(2 * r) * (180 / Math.PI);
}

/**
 * Aspect ratio that gives the table enough vertical room for `seatCount`
 * players without crowding adjacent right/left-side seats. Lower aspect =
 * taller container; we go closer to a square as seat count rises.
 */
export function tableAspectFor(seatCount: number): string {
  if (seatCount <= 7) return "16/10";
  if (seatCount === 8) return "14/10";
  if (seatCount === 9) return "12/10";
  // 10/11-handed: nearly square so the curve seats clear each other vertically
  return "11/10";
}

export function seatXY(
  seat: number,
  total: number,
  opts: { portrait?: boolean; heroSeat?: number | null } = {}
): { x: number; y: number } {
  // Cardroom convention: the dealer occupies the top-centre slot, and seat
  // numbering starts to the dealer's RIGHT (= top-right area) and runs
  // clockwise around the table. We treat the dealer + N seats as (N+1)
  // evenly-spaced slots around the oval. Slot 0 is the dealer; slot k (= seat
  // k) is at angle -90° + k * (360 / (N+1)).
  const slots = total + 1;
  // Portrait + heroSeat: rotate the whole ring so the hero's seat sits at the
  // bottom-centre, PPPoker-style. The hero's action is then right under the
  // thumb regardless of which chair they actually drew.
  const rotDeg =
    opts.portrait && opts.heroSeat
      ? 180 - opts.heroSeat * (360 / slots)
      : 0;
  let angleDeg = seat * (360 / slots) - 90 + rotDeg;
  if (!opts.portrait) angleDeg = landscapeSpread(angleDeg, total);
  const angle = (angleDeg * Math.PI) / 180;
  // Landscape: wider X, flatter Y — reads like a cardroom table. rx pulled in
  // a touch from 44 → 42 so the right-edge seat (at the right midline) doesn't
  // get its icon clipped off-screen on narrow phones.
  // Portrait: taller Y, narrower X — vertical oval that fills a phone screen.
  const rx = opts.portrait ? 38 : 42;
  const ry = opts.portrait ? 44 : 37;
  return {
    x: 50 + rx * Math.cos(angle),
    y: 50 + ry * Math.sin(angle),
  };
}

/** Position of the dealer marker — always top centre of the racetrack. */
export function dealerXY(opts: { portrait?: boolean } = {}): {
  x: number;
  y: number;
} {
  const ry = opts.portrait ? 44 : 37;
  return { x: 50, y: 50 - ry };
}
