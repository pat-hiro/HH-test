import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../data/db";
import { Players, Sessions } from "../../data/repo";

function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

/**
 * Lands the user on the most recent active session's Setup. If none exists,
 * creates a default 9-seat 1/2 NLH session pre-filled with "Unknown" seats.
 */
export default function Entry() {
  const nav = useNavigate();
  const sessions = useLiveQuery(() => db.sessions.toArray(), []);
  const creating = useRef(false);

  useEffect(() => {
    if (sessions === undefined) return;
    const alive = sessions.filter((s) => s.deletedAt === null);
    const latest = alive.sort((a, b) => b.startedAt - a.startedAt)[0];

    if (latest) {
      nav(`/sessions/${latest.id}/setup`, { replace: true });
      return;
    }
    if (creating.current) return;
    creating.current = true;

    (async () => {
      const seatCount = 9;
      const s = await Sessions.create({
        date: todayStr(),
        startedAt: Date.now(),
        endedAt: null,
        casino: "",
        location: "",
        gameType: "NLH",
        gameOther: "",
        sb: 1,
        bb: 2,
        ante: 0,
        autoStraddle: false,
        straddleAmount: 0,
        currency: "JPY",
        exchangeRate: 1,
        seatCount,
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
      for (let i = 1; i <= seatCount; i++) {
        await Players.create({
          sessionId: s.id,
          seat: i,
          name: "Unknown",
          isHero: false,
          isAway: false,
          mustPostBB: false,
          postWithAnte: false,
          stack: 200,
          note: "",
        });
      }
      nav(`/sessions/${s.id}/setup`, { replace: true });
    })();
  }, [sessions, nav]);

  return (
    <div className="min-h-screen flex items-center justify-center text-neutral-500">
      Loading…
    </div>
  );
}
