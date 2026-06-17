import { useNavigate } from "react-router-dom";

export default function Review() {
  const nav = useNavigate();
  return (
    <div className="min-h-screen p-4">
      <div className="flex items-center mb-4">
        <button onClick={() => nav(-1)} className="text-emerald-400">‹ Back</button>
        <div className="flex-1 text-center font-bold">Review</div>
      </div>
      <div className="text-sm text-neutral-400">
        次の増分でハンド一覧／詳細リプレイ／フィルタ／CSV・JSONエクスポートを実装します。
      </div>
    </div>
  );
}
