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
  const angleDeg = seat * (360 / slots) - 90 + rotDeg;
  const angle = (angleDeg * Math.PI) / 180;
  // Landscape: wider X, flatter Y — reads like a cardroom table.
  // Portrait: taller Y, narrower X — vertical oval that fills a phone screen.
  const rx = opts.portrait ? 38 : 44;
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
