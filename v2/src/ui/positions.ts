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

export function seatXY(seat: number, total: number): { x: number; y: number } {
  // Cardroom convention: the dealer occupies the top-centre slot, and seat
  // numbering starts to the dealer's RIGHT (= top-right area) and runs
  // clockwise around the table. We treat the dealer + N seats as (N+1)
  // evenly-spaced slots around the oval. Slot 0 is the dealer; slot k (= seat
  // k) is at angle -90° + k * (360 / (N+1)).
  const slots = total + 1;
  const angle = (seat * (360 / slots) - 90) * (Math.PI / 180);
  // Wider X radius + flatter Y radius spreads the seats along the two long
  // sides of a landscape "racetrack" table, the way a real cardroom table
  // reads, instead of a tall portrait oval.
  return {
    x: 50 + 44 * Math.cos(angle),
    y: 50 + 37 * Math.sin(angle),
  };
}

/** Position of the dealer marker — always top centre of the racetrack. */
export function dealerXY(): { x: number; y: number } {
  return { x: 50, y: 50 - 37 };
}
