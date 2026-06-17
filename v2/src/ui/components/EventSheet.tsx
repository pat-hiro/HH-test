import { useState } from "react";
import type { EventType } from "../../data/types";
import CardPickerSheet from "./CardPickerSheet";

/**
 * Sheet for adding a non-action event to a hand: a free-form note attached
 * at the current street, an exposed-card record (1-2 cards), or a misdeal
 * marker with optional resolution text.
 */
export default function EventSheet({
  seats,
  defaultStreet,
  onCancel,
  onSave,
}: {
  seats: { seat: number; name: string }[];
  defaultStreet: "PF" | "F" | "T" | "R";
  onCancel: () => void;
  onSave: (e: {
    type: EventType;
    street: "PF" | "F" | "T" | "R" | null;
    seat: number | null;
    cards: string[];
    note: string;
    resolution: string;
  }) => void;
}) {
  const [type, setType] = useState<EventType>("NOTE");
  const [seat, setSeat] = useState<number | null>(null);
  const [cards, setCards] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [resolution, setResolution] = useState("");
  const [cardsOpen, setCardsOpen] = useState(false);

  // Reset dependent fields when the type changes so a resolution chosen under
  // EXPOSED_CARD doesn't leak into a MISDEAL save (the two have different
  // option sets).
  const changeType = (t: EventType) => {
    if (t === type) return;
    setType(t);
    setSeat(null);
    setCards([]);
    setResolution("");
  };

  // The 記録 button is disabled until the event actually says something:
  //   NOTE          → some note text
  //   EXPOSED_CARD  → a seat + at least one card
  //   MISDEAL       → a seat + a chosen resolution
  // Saving an empty event only adds noise to the hand history.
  const canSave =
    (type === "NOTE" && note.trim() !== "") ||
    (type === "EXPOSED_CARD" && seat !== null && cards.length > 0) ||
    (type === "MISDEAL" && seat !== null && resolution !== "");
  const dirty =
    note.trim() !== "" ||
    seat !== null ||
    cards.length > 0 ||
    resolution !== "";
  const onBackdrop = () => {
    if (!dirty || confirm("入力中の内容を破棄しますか？")) onCancel();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end" onClick={onBackdrop}>
      <div
        className="bg-neutral-900 w-full max-w-xl mx-auto p-4 rounded-t-2xl border-t border-neutral-800 safe-bottom max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-bold mb-3">イベント追加</div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {(["NOTE", "EXPOSED_CARD", "MISDEAL"] as EventType[]).map((t) => (
            <button
              key={t}
              onClick={() => changeType(t)}
              className={`py-2 rounded text-sm ${type === t ? "bg-blue-500" : "bg-neutral-800"}`}
            >
              {t === "NOTE" ? "メモ" : t === "EXPOSED_CARD" ? "カード露出" : "Misdeal"}
            </button>
          ))}
        </div>

        {(type === "EXPOSED_CARD" || type === "MISDEAL") && (
          <div className="mb-3">
            <label>対象Seat</label>
            <select
              value={seat ?? ""}
              onChange={(e) => setSeat(e.target.value === "" ? null : Number(e.target.value))}
            >
              <option value="">—</option>
              {seats.map((s) => (
                <option key={s.seat} value={s.seat}>
                  S{s.seat} {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {type === "EXPOSED_CARD" && (
          <div className="mb-3">
            <label>露出カード</label>
            <button
              onClick={() => setCardsOpen(true)}
              className="block w-full text-left py-2 px-2 bg-neutral-900 border border-neutral-700 rounded font-mono"
            >
              {cards.length > 0 ? cards.join(" ") : <span className="text-neutral-500">タップで選択</span>}
            </button>
            <label className="mt-2">理由（任意）</label>
            <select value={resolution} onChange={(e) => setResolution(e.target.value)}>
              <option value="">—</option>
              <option value="dealer_error">Dealer error</option>
              <option value="player_flash">Player flash</option>
              <option value="misdeal_suspect">Misdeal 疑い</option>
              <option value="other">その他</option>
            </select>
          </div>
        )}

        {type === "MISDEAL" && (
          <div className="mb-3">
            <label>取り扱い</label>
            <select value={resolution} onChange={(e) => setResolution(e.target.value)}>
              <option value="">—</option>
              <option value="misdeal">Misdeal（やり直し）</option>
              <option value="play_continues">Play continues</option>
              <option value="card_replaced">Card replaced</option>
            </select>
          </div>
        )}

        <div className="mb-3">
          <label>メモ（任意）</label>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={type === "NOTE" ? "例: ディーラー裁定の経緯" : ""}
          />
        </div>

        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-3 bg-neutral-800 rounded">
            Cancel
          </button>
          <button
            onClick={() =>
              onSave({
                type,
                street: defaultStreet,
                seat,
                cards,
                note,
                resolution,
              })
            }
            disabled={!canSave}
            className="flex-1 py-3 bg-blue-500 rounded font-bold disabled:opacity-40"
          >
            記録
          </button>
        </div>
      </div>

      {cardsOpen && (
        <CardPickerSheet
          title="露出カード"
          count={2}
          initial={[cards[0] ?? null, cards[1] ?? null]}
          exclude={[]}
          onSubmit={(cs) => {
            setCards(cs.filter((c): c is string => !!c));
            setCardsOpen(false);
          }}
          onCancel={() => setCardsOpen(false)}
        />
      )}
    </div>
  );
}
