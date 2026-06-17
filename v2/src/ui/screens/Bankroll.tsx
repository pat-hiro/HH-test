import { useNavigate } from "react-router-dom";

export default function Bankroll() {
  const nav = useNavigate();
  return (
    <div className="min-h-screen p-4">
      <div className="flex items-center mb-4">
        <button onClick={() => nav(-1)} className="text-emerald-400">‹ Back</button>
        <div className="flex-1 text-center font-bold">Bankroll</div>
      </div>
      <div className="text-sm text-neutral-400">
        次の増分でセッション損益・時給・グラフ・複数通貨を実装します（Poker Bankroll Tracker準拠）。
      </div>
    </div>
  );
}
