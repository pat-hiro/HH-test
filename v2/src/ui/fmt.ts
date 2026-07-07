/**
 * Compact integer-ish formatting for chip amounts on the visual table.
 *   1234     → "1.2k"
 *   123456   → "123k"
 *   1500000  → "1.5M"
 *   12.3     → "12.3"
 *   0.5      → "0.5"
 *   0        → "0"
 *
 * Trailing ".0" stripped. Negative numbers keep their sign.
 */
export function fmtChips(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";

  // round-up carry: a value that rounds to 1000k (e.g. 999,950) must render
  // as the next unit up, not "1000k".
  if (abs >= 1_000_000 || Math.round(abs / 1_000) >= 1_000) {
    return sign + trimZeros(round(abs / 1_000_000, abs / 1_000_000 < 100 ? 1 : 0)) + "M";
  }
  if (abs >= 1_000) {
    return sign + trimZeros(round(abs / 1_000, abs / 1_000 < 100 ? 1 : 0)) + "k";
  }
  if (abs >= 100) {
    // round to nearest int for triple-digit chips
    return sign + Math.round(abs).toString();
  }
  // keep up to 2 decimals for small amounts (so 0.5BB blinds read clearly)
  return sign + trimZeros(round(abs, 2));
}

function round(v: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(v * f) / f;
}
function trimZeros(v: number): string {
  return String(v);
}
