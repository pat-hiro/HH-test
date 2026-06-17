import type { ReactNode } from "react";
import PlayingCard from "./PlayingCard";
import { dealerXY, seatXY } from "../positions";
import { fmtChips } from "../fmt";

export interface SeatVM {
  seat: number;
  position: string;
  name: string;
  stack: number | null;
  isHero: boolean;
  isBTN: boolean;
  isCurrent: boolean;
  isFolded: boolean;
  isAllIn: boolean;
  cards: [string, string] | null;
  liveBet: number;
  /** "sb" | "bb" | "straddle" | "post" | null — drives the chip color/label */
  blind?: "sb" | "bb" | "straddle" | "post" | null;
  /** dead BB-ante chip (preflop only) — pot-only, doesn't affect to-call */
  ante?: number;
}

/**
 * Casino-style chip denominations, scaled to BB so the same palette works
 * across stakes. Real cardrooms use distinct colours per denomination — those
 * colours are far more readable at a glance than an amber-only gradient.
 *
 *   < 2 BB    white   (1 unit / small change)
 *   2..5 BB   red     ($5 chip)
 *   5..15 BB  green   ($25)
 *   15..50 BB black   ($100)
 *   50..200   purple  ($500)
 *   >= 200 BB yellow  ($1000)
 */
interface ChipPalette {
  face: string; // gradient from/to for the chip body
  edge: string; // border tint
  label: string; // text color for the amount
}
function chipPaletteFor(amount: number, bb: number): ChipPalette {
  const ratio = bb > 0 ? amount / bb : 0;
  if (ratio < 2)
    return {
      face: "from-neutral-100 to-neutral-300",
      edge: "border-neutral-400",
      label: "text-neutral-900",
    };
  if (ratio < 5)
    return {
      face: "from-rose-500 to-rose-700",
      edge: "border-rose-300",
      label: "text-white",
    };
  if (ratio < 15)
    return {
      face: "from-emerald-500 to-emerald-700",
      edge: "border-emerald-300",
      label: "text-white",
    };
  if (ratio < 50)
    return {
      face: "from-neutral-800 to-neutral-950",
      edge: "border-neutral-500",
      label: "text-white",
    };
  if (ratio < 200)
    return {
      face: "from-purple-500 to-purple-700",
      edge: "border-purple-300",
      label: "text-white",
    };
  return {
    face: "from-yellow-300 to-amber-500",
    edge: "border-yellow-200",
    label: "text-neutral-900",
  };
}

/** A poker-chip-styled bet marker. */
function Chip({
  amount,
  kind,
  bb,
}: {
  amount: number;
  kind?: SeatVM["blind"];
  bb: number;
}) {
  const palette = chipPaletteFor(amount, bb);
  const label =
    kind === "sb"
      ? "SB"
      : kind === "bb"
        ? "BB"
        : kind === "straddle"
          ? "STR"
          : kind === "post"
            ? "POST"
            : null;
  return (
    <div className="flex items-center gap-1 bg-neutral-900/85 rounded-full pl-0.5 pr-2 py-0.5 shadow-lg">
      <div
        className={`w-5 h-5 rounded-full bg-gradient-to-b ${palette.face} border-2 ${palette.edge} shadow-inner flex items-center justify-center`}
        style={{
          backgroundImage:
            "repeating-conic-gradient(rgba(255,255,255,0.55) 0deg 12deg, transparent 12deg 30deg)",
        }}
      >
        <div
          className={`w-3 h-3 rounded-full bg-gradient-to-b ${palette.face} border ${palette.edge}`}
        />
      </div>
      <span className="text-[11px] font-bold text-yellow-200 leading-none">
        {label && <span className="text-[8px] text-neutral-300 mr-0.5">{label}</span>}
        {fmtChips(amount)}
      </span>
    </div>
  );
}

export default function PokerTable({
  totalSeats,
  seats,
  pot,
  streetLabel,
  board,
  onTapSeat,
  onTapBoardSlot,
  aspectRatio = "3/4",
  bb = 1,
}: {
  totalSeats: number;
  seats: SeatVM[];
  pot: number;
  streetLabel: string;
  board: (string | null)[];
  onTapSeat?: (seat: number) => void;
  onTapBoardSlot?: (i: number) => void;
  aspectRatio?: string;
  /** big blind, used to scale the chip-shade gradient by bet-size */
  bb?: number;
}): ReactNode {
  return (
    <div className="relative w-full max-h-[60vh]" style={{ aspectRatio }}>
      <div className="absolute inset-x-2 top-[12%] bottom-[12%] rounded-[50%] bg-gradient-to-b from-felt-700 to-felt-900 border-[6px] border-neutral-900 shadow-inner" />

      {/* Dealer marker — fixed top-centre of the oval. */}
      {(() => {
        const dx = dealerXY();
        return (
          <div
            className="absolute z-10 pointer-events-none flex flex-col items-center"
            style={{
              left: `${dx.x}%`,
              top: `${dx.y}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-b from-neutral-200 to-neutral-400 border-2 border-neutral-600 shadow-lg flex items-center justify-center">
              <span className="text-xs font-black text-neutral-800">DLR</span>
            </div>
            <div className="text-[8px] text-neutral-400 mt-0.5 tracking-wider">
              DEALER
            </div>
          </div>
        );
      })()}

      {/* center: pot + board */}
      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
        <div className="text-[10px] text-yellow-300 uppercase tracking-wider">
          {streetLabel}
        </div>
        <div className="text-sm font-bold text-yellow-200 mb-2">
          Pot {fmtChips(pot)}
        </div>
        <div className="flex gap-1 pointer-events-auto">
          {[0, 1, 2, 3, 4].map((i) => (
            <button key={i} onClick={() => onTapBoardSlot?.(i)}>
              <PlayingCard card={board[i] ?? null} size="sm" />
            </button>
          ))}
        </div>
      </div>

      {seats.map((s) => {
        const { x, y } = seatXY(s.seat, totalSeats);
        // Pull the bet chip toward the table centre so it reads as "in front of"
        // the seat — but cap the pull so chips for seats near the top/bottom
        // don't intrude on the central pot/board strip.
        const dx = 50 - x;
        const dy = 50 - y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const pull = Math.min(0.32, 12 / dist);
        const towardCenterX = dx * pull;
        const towardCenterY = dy * pull;
        return (
          <div key={s.seat}>
            {/* bet + ante chips, placed between the seat and the pot */}
            {(s.liveBet > 0 || (s.ante ?? 0) > 0) && (
              <div
                className="absolute z-10 pointer-events-none flex flex-col items-center gap-0.5"
                style={{
                  left: `${x + towardCenterX}%`,
                  top: `${y + towardCenterY}%`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                {s.liveBet > 0 && (
                  <Chip amount={s.liveBet} kind={s.blind} bb={bb} />
                )}
                {(s.ante ?? 0) > 0 && (
                  <div className="flex items-center gap-1 bg-neutral-900/85 rounded-full pl-0.5 pr-1.5 py-0.5 shadow">
                    <div className="w-3.5 h-3.5 rounded-full bg-gradient-to-b from-neutral-300 to-neutral-500 border border-white/60" />
                    <span className="text-[8px] text-neutral-300 leading-none">
                      ANTE {fmtChips(s.ante ?? 0)}
                    </span>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => onTapSeat?.(s.seat)}
              className="absolute flex flex-col items-center"
              style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
            >
              <div className="flex gap-0.5 mb-1 relative">
                <PlayingCard
                  card={s.cards?.[0] ?? null}
                  size="sm"
                  faceDown={!s.cards}
                  dim={s.isFolded}
                  highlight={s.isCurrent}
                />
                <PlayingCard
                  card={s.cards?.[1] ?? null}
                  size="sm"
                  faceDown={!s.cards}
                  dim={s.isFolded}
                  highlight={s.isCurrent}
                />
                {s.isAllIn && !s.isFolded && (
                  <div className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-rose-300 bg-black/50 rounded">
                    ALL-IN
                  </div>
                )}
                {s.isBTN && (
                  <div className="absolute -top-2.5 -right-2.5 w-7 h-7 rounded-full bg-gradient-to-b from-white to-neutral-200 text-black text-xs font-black flex items-center justify-center border-2 border-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.8)] z-20">
                    D
                  </div>
                )}
              </div>
              {s.position && (
                <div className="text-[9px] text-neutral-200 px-1 rounded bg-neutral-900/60">
                  {s.position}
                </div>
              )}
              <div className={`text-[10px] font-semibold ${s.isHero ? "text-yellow-300" : "text-white"}`}>
                {s.isHero ? "★ " : ""}
                {s.name || "—"}
              </div>
              {s.stack !== null && (
                <div className="text-[9px] text-neutral-300">
                  ${fmtChips(s.stack)}
                </div>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
