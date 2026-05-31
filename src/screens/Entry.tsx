import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";

function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

export default function EntryScreen() {
  const nav = useNavigate();
  const sessions = useLiveQuery(
    () => db.sessions.orderBy("startedAt").reverse().toArray(),
    []
  );
  const lastSession = sessions?.[0];
  const creating = useRef(false);

  useEffect(() => {
    if (sessions === undefined) return;
    if (lastSession?.id !== undefined) {
      nav(`/sessions/${lastSession.id}/setup`, { replace: true });
      return;
    }
    if (creating.current) return;
    creating.current = true;
    (async () => {
      const now = Date.now();
      const seats = 9;
      const id = await db.sessions.add({
        startedAt: now,
        date: todayStr(),
        casino: "",
        game: "NLH",
        gameOther: "",
        sb: 1,
        bb: 2,
        ante: 0,
        rake: {
          percent: 5,
          cap: 0,
          useTimeRake: false,
          timeAmount: 0,
          timeIntervalMin: 30,
        },
        seats,
        heroSeat: null,
        note: "",
        buttonSeat: null,
        autoStraddle: false,
        straddleSeats: [],
      });
      for (let i = 1; i <= seats; i++) {
        await db.players.add({
          sessionId: id,
          seat: i,
          name: "Unknown",
          isHero: false,
          isAway: false,
          mustPostSB: false,
          mustPostBB: false,
          note: "",
          joinedAt: now,
        });
      }
      nav(`/sessions/${id}/setup`, { replace: true });
    })();
  }, [sessions, lastSession, nav]);

  return (
    <div className="min-h-screen flex items-center justify-center text-neutral-500">
      Loading…
    </div>
  );
}
