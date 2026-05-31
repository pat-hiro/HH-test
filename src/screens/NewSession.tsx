import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import TopBar from "../components/TopBar";
import { db } from "../db/db";
import type { RakeConfig, SessionTemplate } from "../db/types";

function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

const defaultRake = (): RakeConfig => ({
  percent: 5,
  cap: 0,
  useTimeRake: false,
  timeAmount: 0,
  timeIntervalMin: 30,
});

export default function NewSessionScreen() {
  const nav = useNavigate();
  const templates = useLiveQuery(() => db.templates.toArray(), []);
  const pastCasinos = useLiveQuery(
    () =>
      db.sessions.toArray().then((ss) => {
        const counts = new Map<string, number>();
        for (const s of ss) {
          if (!s.casino) continue;
          counts.set(s.casino, (counts.get(s.casino) ?? 0) + 1);
        }
        return Array.from(counts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([c]) => c);
      }),
    []
  );

  const [date, setDate] = useState(todayStr());
  const [casino, setCasino] = useState("");
  const [game, setGame] = useState("NLH");
  const [gameOther, setGameOther] = useState("");
  const [sb, setSb] = useState(1);
  const [bb, setBb] = useState(2);
  const [ante, setAnte] = useState(0);
  const [rake, setRake] = useState<RakeConfig>(defaultRake());
  const [seats, setSeats] = useState(9);
  const [autoStraddle, setAutoStraddle] = useState(false);
  const [note, setNote] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const sbManuallyEditedRef = useRef(false);

  useEffect(() => {
    if (!sbManuallyEditedRef.current) {
      setSb(bb / 2);
    }
  }, [bb]);

  const applyTemplate = (t: SessionTemplate) => {
    setCasino(t.casino);
    setGame(t.game);
    setGameOther(t.gameOther ?? "");
    setSb(t.sb);
    setBb(t.bb);
    setAnte(t.ante);
    setRake(t.rake ?? defaultRake());
    setSeats(t.seats);
    setAutoStraddle(t.autoStraddle ?? false);
    sbManuallyEditedRef.current = true;
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) return;
    await db.templates.add({
      name: templateName.trim(),
      casino,
      game,
      gameOther,
      sb,
      bb,
      ante,
      rake,
      seats,
      autoStraddle,
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
      gameOther,
      sb,
      bb,
      ante,
      rake,
      seats,
      heroSeat: null,
      note,
      buttonSeat: null,
      autoStraddle,
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
    nav(`/sessions/${id}/setup`);
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
              <option>Squid</option>
              <option>Sushi</option>
              <option>72o</option>
              <option>Other</option>
            </select>
            {game === "Other" && (
              <input
                className="mt-2"
                value={gameOther}
                onChange={(e) => setGameOther(e.target.value)}
                placeholder="ゲーム名を入力"
              />
            )}
          </div>

          <div className="col-span-2">
            <label>カジノ</label>
            <input
              value={casino}
              onChange={(e) => setCasino(e.target.value)}
              placeholder="例: Bellagio"
            />
            {pastCasinos && pastCasinos.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {pastCasinos.slice(0, 12).map((c) => (
                  <button
                    key={c}
                    onClick={() => setCasino(c)}
                    className={`px-3 py-1 rounded text-sm ${
                      casino === c ? "bg-felt-700" : "bg-neutral-800"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label>SB</label>
            <input
              type="number"
              onFocus={(e) => e.currentTarget.select()}
              inputMode="decimal"
              value={sb}
              onChange={(e) => {
                sbManuallyEditedRef.current = true;
                setSb(parseFloat(e.target.value) || 0);
              }}
            />
          </div>
          <div>
            <label>BB</label>
            <input
              type="number"
              onFocus={(e) => e.currentTarget.select()}
              inputMode="decimal"
              value={bb}
              onChange={(e) => setBb(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <label>Ante（BB ante）</label>
            <input
              type="number"
              onFocus={(e) => e.currentTarget.select()}
              inputMode="decimal"
              value={ante}
              onChange={(e) => setAnte(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div>
            <label>オートストラドル</label>
            <button
              onClick={() => setAutoStraddle((v) => !v)}
              className={`w-full py-2 rounded ${
                autoStraddle ? "bg-felt-700" : "bg-neutral-800"
              }`}
            >
              {autoStraddle ? "ON" : "OFF"}
            </button>
          </div>

          <div className="col-span-2">
            <label>Seat数</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { n: 9, label: "Full ring (9)" },
                { n: 6, label: "6max" },
                { n: 2, label: "HU" },
              ].map((o) => (
                <button
                  key={o.n}
                  onClick={() => setSeats(o.n)}
                  className={`py-2 rounded text-sm ${
                    seats === o.n ? "bg-felt-700" : "bg-neutral-800"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="col-span-2">
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className="w-full py-2 text-sm text-neutral-400 bg-neutral-900 border border-neutral-800 rounded"
            >
              {showAdvanced ? "▲ 詳細設定を閉じる" : "▼ 詳細設定（レーキ / メモ）"}
            </button>
          </div>

          {showAdvanced && (
            <>
              <div className="col-span-2 bg-neutral-900 border border-neutral-800 rounded p-3 space-y-2">
                <div className="text-sm text-neutral-300">レーキ</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label>％</label>
                    <input
                      type="number"
                      onFocus={(e) => e.currentTarget.select()}
                      inputMode="decimal"
                      value={rake.percent}
                      onChange={(e) =>
                        setRake({
                          ...rake,
                          percent: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label>Cap</label>
                    <input
                      type="number"
                      onFocus={(e) => e.currentTarget.select()}
                      inputMode="decimal"
                      value={rake.cap}
                      onChange={(e) =>
                        setRake({ ...rake, cap: parseFloat(e.target.value) || 0 })
                      }
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    checked={rake.useTimeRake}
                    onChange={(e) =>
                      setRake({ ...rake, useTimeRake: e.target.checked })
                    }
                  />
                  タイムレーキを使う
                </label>
                {rake.useTimeRake && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label>金額</label>
                      <input
                        type="number"
                        onFocus={(e) => e.currentTarget.select()}
                        inputMode="decimal"
                        value={rake.timeAmount}
                        onChange={(e) =>
                          setRake({
                            ...rake,
                            timeAmount: parseFloat(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label>間隔(分)</label>
                      <input
                        type="number"
                        onFocus={(e) => e.currentTarget.select()}
                        inputMode="numeric"
                        value={rake.timeIntervalMin}
                        onChange={(e) =>
                          setRake({
                            ...rake,
                            timeIntervalMin: parseFloat(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="col-span-2">
                <label>メモ</label>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        {showAdvanced && (
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
        )}

        <button
          onClick={create}
          className="w-full bg-felt-700 hover:bg-felt-800 py-3 rounded font-semibold"
        >
          テーブルへ（Hero と BTN を選択）
        </button>
      </div>
    </div>
  );
}
