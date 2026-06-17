import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import Entry from "./screens/Entry";
import Setup from "./screens/Setup";
import Hand from "./screens/Hand";
import Review from "./screens/Review";
import Bankroll from "./screens/Bankroll";
import TabBar from "./components/TabBar";
import { db } from "../data/db";

function WithTabBar({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const fromUrl = params.sessionId ?? null;
  const latest = useLiveQuery(async () => {
    if (fromUrl) return null;
    const all = await db.sessions.toArray();
    const alive = all.filter((s) => s.deletedAt === null);
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
        <Route path="/sessions/:sessionId/hands/:handId" element={<WithTabBar><Hand /></WithTabBar>} />
        <Route path="/review" element={<WithTabBar><Review /></WithTabBar>} />
        <Route path="/bankroll" element={<WithTabBar><Bankroll /></WithTabBar>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
