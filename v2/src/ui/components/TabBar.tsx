import { Link, useLocation } from "react-router-dom";

export default function TabBar({ sessionId }: { sessionId: string | null }) {
  const loc = useLocation();
  const onSetup = loc.pathname.includes("/setup") || loc.pathname.endsWith("/hands");
  const onHand = /\/hands\/[^/]+/.test(loc.pathname);
  const onReview = loc.pathname.startsWith("/review");
  const onBankroll = loc.pathname.startsWith("/bankroll");

  const cls = (active: boolean) =>
    `flex-1 py-2 text-center text-[11px] ${active ? "text-emerald-400 font-bold" : "text-neutral-400"}`;

  return (
    <div
      className="fixed bottom-0 inset-x-0 max-w-xl mx-auto bg-neutral-950/95 border-t border-neutral-800 flex"
      style={{ paddingBottom: "max(0px, env(safe-area-inset-bottom))" }}
    >
      <Link
        to={sessionId ? `/sessions/${sessionId}/setup` : "/"}
        className={cls(onSetup || onHand)}
      >
        <div className="text-lg">🎲</div>
        Play
      </Link>
      <Link to="/review" className={cls(onReview)}>
        <div className="text-lg">📋</div>
        Review
      </Link>
      <Link to="/bankroll" className={cls(onBankroll)}>
        <div className="text-lg">💰</div>
        Bankroll
      </Link>
    </div>
  );
}
