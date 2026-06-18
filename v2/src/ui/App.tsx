import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import Entry from "./screens/Entry";
import Setup from "./screens/Setup";
import Hand from "./screens/Hand";
import HandDrag from "./screens/HandDrag";
import Review from "./screens/Review";
import Bankroll from "./screens/Bankroll";
import SettingsScreen from "./screens/Settings";
import TabBar from "./components/TabBar";
import { db } from "../data/db";

// Force a fresh component instance per handId so local state (sheets,
// promptedRef, knownCards, shares) can't bleed from the previous hand into
// the next one when nextHand() navigates.
function HandWrapper() {
  const params = useParams();
  return <Hand key={params.handId ?? ""} />;
}
function HandDragWrapper() {
  const params = useParams();
  return <HandDrag key={params.handId ?? ""} />;
}

function WithTabBar({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const fromUrl = params.sessionId ?? null;
  const latest = useLiveQuery(async () => {
    if (fromUrl) return null;
    const all = await db.sessions.toArray();
    const alive = all.filter((s) => s.deletedAt === 0);
    return alive.sort((a, b) => b.startedAt - a.startedAt)[0]?.id ?? null;
  }, [fromUrl]);
  const sessionId = fromUrl ?? latest ?? null;
  return (
    <div className="pb-14">
      {children}
      <TabBar sessionId={sessionId} />
    </div>
  );
}

export default function App() {
  return (
    <div className="min-h-full max-w-xl mx-auto">
      <Routes>
        <Route path="/" element={<Entry />} />
        <Route path="/sessions/:sessionId/setup" element={<WithTabBar><Setup /></WithTabBar>} />
        <Route path="/sessions/:sessionId/hands/:handId" element={<WithTabBar><HandWrapper /></WithTabBar>} />
        <Route path="/sessions/:sessionId/hands/:handId/drag" element={<WithTabBar><HandDragWrapper /></WithTabBar>} />
        <Route path="/review" element={<WithTabBar><Review /></WithTabBar>} />
        <Route path="/bankroll" element={<WithTabBar><Bankroll /></WithTabBar>} />
        <Route path="/settings" element={<WithTabBar><SettingsScreen /></WithTabBar>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
