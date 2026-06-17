import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Settings as SettingsRepo } from "../../data/repo";
import type { AppSettings } from "../../data/types";
import type { BetPreset } from "../../data/types-presets";

type ListKey = "pfRaise" | "pfRaiseStraddle" | "postflopBet" | "postflopRaise";

const SECTIONS: { key: ListKey; title: string; bases: BetPreset["basis"][] }[] = [
  { key: "pfRaise", title: "PF レイズ", bases: ["bb", "pot"] },
  {
    key: "pfRaiseStraddle",
    title: "PF レイズ（ストラドル時）",
    bases: ["str", "bb", "pot"],
  },
  { key: "postflopBet", title: "ポストフロップ ベット", bases: ["pot", "bb"] },
  {
    key: "postflopRaise",
    title: "ポストフロップ レイズ",
    bases: ["call", "pot", "bb"],
  },
];

const BASIS_LABEL: Record<BetPreset["basis"], string> = {
  bb: "BB",
  str: "STR",
  pot: "Pot",
  call: "Call",
};

export default function SettingsScreen() {
  const nav = useNavigate();
  const settings = useLiveQuery(() => SettingsRepo.get(), []);
  const [draft, setDraft] = useState<AppSettings | null>(null);

  useEffect(() => {
    if (settings && !draft) setDraft({ ...settings });
  }, [settings, draft]);

  if (!draft) return null;

  const updateList = (key: ListKey, list: BetPreset[]) => {
    setDraft({ ...draft, [key]: list });
  };
  const editPreset = (key: ListKey, idx: number, patch: Partial<BetPreset>) => {
    const next = [...draft[key]];
    next[idx] = { ...next[idx], ...patch };
    updateList(key, next);
  };
  const addPreset = (key: ListKey, defaultBasis: BetPreset["basis"]) => {
    updateList(key, [
      ...draft[key],
      { label: "新", multiplier: 2, basis: defaultBasis },
    ]);
  };
  const removePreset = (key: ListKey, idx: number) => {
    const next = [...draft[key]];
    next.splice(idx, 1);
    updateList(key, next);
  };

  const save = async () => {
    await SettingsRepo.update({
      baseCurrency: draft.baseCurrency,
      pfRaise: draft.pfRaise,
      pfRaiseStraddle: draft.pfRaiseStraddle,
      postflopBet: draft.postflopBet,
      postflopRaise: draft.postflopRaise,
    });
    nav(-1);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center px-3 py-2 border-b border-neutral-800">
        <button onClick={() => nav(-1)} className="text-emerald-400 text-sm">
          ‹ Back
        </button>
        <div className="flex-1 text-center font-bold">Settings</div>
        <button
          onClick={save}
          className="text-xs px-3 py-1 bg-blue-500 rounded font-bold"
        >
          Save
        </button>
      </div>

      <div className="p-3 space-y-3">
        <div className="bg-neutral-900 border border-neutral-800 rounded p-3">
          <label>基準通貨</label>
          <input
            value={draft.baseCurrency}
            maxLength={3}
            onChange={(e) =>
              setDraft({ ...draft, baseCurrency: e.target.value.toUpperCase().slice(0, 3) })
            }
          />
          <div className="text-[11px] text-neutral-500 mt-1">
            Bankroll での合計計算と為替換算に使用
          </div>
        </div>

        {SECTIONS.map((sec) => (
          <div key={sec.key} className="bg-neutral-900 border border-neutral-800 rounded p-3">
            <div className="text-sm font-bold mb-2">{sec.title}</div>
            <div className="grid grid-cols-[1fr_60px_80px_36px] gap-2 text-[11px] text-neutral-500 mb-1">
              <div>ラベル</div>
              <div>倍率</div>
              <div>基準</div>
              <div />
            </div>
            {draft[sec.key].map((p, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_60px_80px_36px] gap-2 items-center py-1"
              >
                <input
                  value={p.label}
                  onChange={(e) => editPreset(sec.key, i, { label: e.target.value })}
                  className="text-sm py-1"
                />
                <input
                  type="number"
                  inputMode="decimal"
                  onFocus={(e) => e.currentTarget.select()}
                  value={p.multiplier}
                  onChange={(e) =>
                    editPreset(sec.key, i, {
                      multiplier: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="text-sm py-1"
                />
                <select
                  value={p.basis}
                  onChange={(e) =>
                    editPreset(sec.key, i, {
                      basis: e.target.value as BetPreset["basis"],
                    })
                  }
                  className="text-sm py-1"
                >
                  {sec.bases.map((b) => (
                    <option key={b} value={b}>
                      {BASIS_LABEL[b]}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => removePreset(sec.key, i)}
                  className="text-rose-400 text-sm"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={() => addPreset(sec.key, sec.bases[0])}
              className="mt-2 text-xs text-emerald-400"
            >
              + プリセット追加
            </button>
          </div>
        ))}

        <div className="text-[11px] text-neutral-500">
          基準は <strong>BB</strong>＝ビッグブラインド倍、<strong>STR</strong>＝ストラドル倍、
          <strong>Pot</strong>＝現在ポット倍、<strong>Call</strong>＝コール額倍。
        </div>
      </div>
    </div>
  );
}
