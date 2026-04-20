import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import TopBar from "../components/TopBar";
import { db } from "../db/db";
import type { SessionTemplate } from "../db/types";

function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

export default function NewSessionScreen() {
  const nav = useNavigate();
  const templates = useLiveQuery(() => db.templates.toArray(), []);

  const [date, setDate] = useState(todayStr());
  const [casino, setCasino] = useState("");
  const [game, setGame] = useState("NLH");
  const [stakesLabel, setStakesLabel] = useState("1/3");
  const [sb, setSb] = useState(1);
  const [bb, setBb] = useState(3);
  const [ante, setAnte] = useState(0);
  const [rake, setRake] = useState("10% max 5");
  const [tableLabel, setTableLabel] = useState("");
  const [seats, setSeats] = useState(9);
  const [note, setNote] = useState("");
  const [templateName, setTemplateName] = useState("");

  useEffect(() => {
    if (stakesLabel.match(/^(\d+(\.\d+)?)\s*\/\s*(\d+(\.\d+)?)$/)) {
      const parts = stakesLabel.split("/").map((p) => parseFloat(p.trim()));
      if (!isNaN(parts[0]) && !isNaN(parts[1])) {
        setSb(parts[0]);
        setBb(parts[1]);
      }
    }
  }, [stakesLabel]);

  const applyTemplate = (t: SessionTemplate) => {
    setCasino(t.casino);
    setGame(t.game);
    setStakesLabel(t.stakesLabel);
    setSb(t.sb);
    setBb(t.bb);
    setAnte(t.ante);
    setRake(t.rake);
    setSeats(t.seats);
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) return;
    await db.templates.add({
      name: templateName.trim(),
      casino,
      game,
      stakesLabel,
      sb,
      bb,
      ante,
      rake,
      seats,
    });
    setTemplateName("");
  };

  const create = async () => {
    const now = Date.now();
    const id = await db.sessions.add({
      startedAt: now,
      date,
      casino,
      game,
      stakesLabel,
      sb,
      bb,
      ante,
      rake,
      tableLabel,
      seats,
      heroSeat: null,
      note,
      buttonSeat: null,
      autoStraddle: false,
      straddleSeats: [],
    });
    for (let i = 1; i <= seats; i++) {
      await db.players.add({
        sessionId: id,
        seat: i,
        name: "",
        isHero: false,
        isAway: false,
        mustPostSB: false,
        mustPostBB: false,
        note: "",
        joinedAt: now,
      });
    }
    nav(`/sessions/${id}/table`);
  };

  return (
    <div className="pb-24">
      <TopBar title="新しいセッション" back="/" />
      <div className="p-3 space-y-4">
        {templates && templates.length > 0 && (
          <div className="bg-neutral-900 border border-neutral-800 rounded p-3">
            <div className="text-sm mb-2 text-neutral-300">テンプレートから</div>
            <div className="flex flex-wrap gap-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => applyTemplate(t)}
                  className="px-3 py-1 bg-neutral-800 rounded text-sm"
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label>日付</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label>ゲーム種別</label>
            <select value={game} onChange={(e) => setGame(e.target.value)}>
              <option>NLH</option>
              <option>PLO</option>
              <option>Other</option>
            </select>
          </div>
          <div className="col-span-2">
            <label>カジノ</label>
            <input
              list="casino-list"
              value={casino}
              onChange={(e) => setCasino(e.target.value)}
              placeholder="例: Bellagio"
            />
            <datalist id="casino-list">
              {templates?.map((t) => (
                <option key={t.id} value={t.casino} />
              ))}
            </datalist>
          </div>
          <div>
            <label>ステークス</label>
            <input
              value={stakesLabel}
              onChange={(e) => setStakesLabel(e.target.value)}
              placeholder="1/3"
            />
          </div>
          <div>
            <label>テーブル</label>
            <input
              value={tableLabel}
              onChange={(e) => setTableLabel(e.target.value)}
              placeholder="任意"
            />
          </div>
          <div>
            <label>SB</label>
            <input
              type="number"
              value={sb}
              onChange={(e) => setSb(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <label>BB</label>
            <input
              type="number"
              value={bb}
              onChange={(e) => setBb(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <label>Ante</label>
            <input
              type="number"
              value={ante}
              onChange={(e) => setAnte(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <label>Seat数</label>
            <select
              value={seats}
              onChange={(e) => setSeats(parseInt(e.target.value, 10))}
            >
              <option value={6}>6</option>
              <option value={8}>8</option>
              <option value={9}>9</option>
              <option value={10}>10</option>
            </select>
          </div>
          <div className="col-span-2">
            <label>レーキ</label>
            <input value={rake} onChange={(e) => setRake(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label>メモ</label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded p-3">
          <label>テンプレートとして保存</label>
          <div className="flex gap-2">
            <input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="テンプレート名"
            />
            <button
              onClick={saveTemplate}
              className="px-3 bg-neutral-800 rounded whitespace-nowrap text-sm"
            >
              保存
            </button>
          </div>
        </div>

        <button
          onClick={create}
          className="w-full bg-felt-700 hover:bg-felt-800 py-3 rounded font-semibold"
        >
          セッションを開始
        </button>
      </div>
    </div>
  );
}
