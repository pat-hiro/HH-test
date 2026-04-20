import type { RakeConfig, Session } from "../db/types";

export function formatStakes(s: Pick<Session, "sb" | "bb">): string {
  return `${s.sb}/${s.bb}`;
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
