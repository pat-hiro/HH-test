const LABELS: Record<number, string[]> = {
  2: ["BTN", "BB"],
  3: ["BTN", "SB", "BB"],
  4: ["BTN", "SB", "BB", "UTG"],
  5: ["BTN", "SB", "BB", "UTG", "CO"],
  6: ["BTN", "SB", "BB", "UTG", "HJ", "CO"],
  7: ["BTN", "SB", "BB", "UTG", "+1", "HJ", "CO"],
  8: ["BTN", "SB", "BB", "UTG", "+1", "LJ", "HJ", "CO"],
  9: ["BTN", "SB", "BB", "UTG", "+1", "+2", "LJ", "HJ", "CO"],
};

export function getPositionLabels(
  activeSeats: number[],
  btnSeat: number | null
): Map<number, string> {
  const map = new Map<number, string>();
  if (btnSeat === null) return map;
  const sorted = [...activeSeats].sort((a, b) => a - b);
  const n = sorted.length;
  const btnIdx = sorted.indexOf(btnSeat);
  if (btnIdx < 0) return map;
  const order = LABELS[n] ?? LABELS[9];
  for (let i = 0; i < n; i++) {
    const seat = sorted[(btnIdx + i) % n];
    map.set(seat, order[i] ?? "");
  }
  return map;
}

export function seatXY(
  seat: number,
  totalSeats: number
): { x: number; y: number } {
  const angle = ((seat - 1) * (360 / totalSeats) - 90) * (Math.PI / 180);
  return {
    x: 50 + 42 * Math.cos(angle),
    y: 50 + 38 * Math.sin(angle),
  };
}
