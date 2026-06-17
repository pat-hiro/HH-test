import { Navigate, Route, Routes } from "react-router-dom";
import Entry from "./screens/Entry";
import Setup from "./screens/Setup";
import Hand from "./screens/Hand";
import Review from "./screens/Review";
import Bankroll from "./screens/Bankroll";

export default function App() {
  return (
    <div className="min-h-full max-w-xl mx-auto">
      <Routes>
        <Route path="/" element={<Entry />} />
        <Route path="/sessions/:sessionId/setup" element={<Setup />} />
        <Route path="/sessions/:sessionId/hands/:handId" element={<Hand />} />
        <Route path="/review" element={<Review />} />
        <Route path="/bankroll" element={<Bankroll />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
