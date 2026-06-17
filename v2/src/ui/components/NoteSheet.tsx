import { useState } from "react";

export default function NoteSheet({
  initial,
  onCancel,
  onSave,
}: {
  initial: string;
  onCancel: () => void;
  onSave: (note: string) => void;
}) {
  const [text, setText] = useState(initial);
  const dirty = text !== initial;
  // Backdrop tap should not silently throw away an edit. If the text changed
  // from what we loaded with, prompt before dismissing.
  const onBackdrop = () => {
    if (!dirty || confirm("変更を破棄しますか？")) onCancel();
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end" onClick={onBackdrop}>
      <div
        className="bg-neutral-900 w-full max-w-xl mx-auto p-4 rounded-t-2xl border-t border-neutral-800 safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <label>ハンドメモ</label>
        <textarea
          autoFocus
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="ラインの意図、リード、ディーラー裁定 など"
        />
        <div className="flex gap-2 mt-3">
          <button onClick={onCancel} className="flex-1 py-3 bg-neutral-800 rounded">
            キャンセル
          </button>
          <button
            onClick={() => onSave(text)}
            className="flex-1 py-3 bg-felt-700 rounded font-bold"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
