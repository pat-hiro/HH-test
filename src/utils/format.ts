import type { RakeConfig, Session } from "../db/types";

export function formatStakes(
  s: Pick<Session, "sb" | "bb" | "ante" | "autoStraddle">
): string {
  const parts = [String(s.sb), String(s.bb)];
  if (s.autoStraddle) parts.push(String(s.bb * 2));
  let str = parts.join("/");
  if (s.ante && s.ante > 0) str += `(${s.ante})`;
  return str;
}

export function formatGame(s: Pick<Session, "game" | "gameOther">): string {
  if (s.game === "Other" && s.gameOther) return s.gameOther;
  return s.game;
}

export function formatRake(r: RakeConfig | undefined): string {
  if (!r) return "—";
  const parts: string[] = [];
  if (r.percent > 0) parts.push(`${r.percent}%`);
  if (r.cap > 0) parts.push(`cap ${r.cap}`);
  if (r.useTimeRake && r.timeAmount > 0) {
    parts.push(`time ${r.timeAmount}/${r.timeIntervalMin}min`);
  }
  return parts.length ? parts.join(" ") : "—";
}
