import type { ReactNode } from "react";
import PlayingCard from "./PlayingCard";
import { seatXY } from "../positions";

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
}: {
  totalSeats: number;
  seats: SeatVM[];
  pot: number;
  streetLabel: string;
  board: (string | null)[];
  onTapSeat?: (seat: number) => void;
  onTapBoardSlot?: (i: number) => void;
  aspectRatio?: string;
}): ReactNode {
  return (
    <div className="relative w-full max-h-[60vh]" style={{ aspectRatio }}>
      <div className="absolute inset-x-2 top-[12%] bottom-[12%] rounded-[50%] bg-gradient-to-b from-felt-700 to-felt-900 border-[6px] border-neutral-900 shadow-inner" />

      {/* center: pot + board */}
      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
        <div className="text-[10px] text-yellow-300 uppercase tracking-wider">
          {streetLabel}
        </div>
        <div className="text-sm font-bold text-yellow-200 mb-2">Pot {pot}</div>
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
        return (
          <button
            key={s.seat}
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
              <div className="text-[9px] text-neutral-300">${s.stack}</div>
            )}
            {s.isBTN && (
              <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white text-black text-[10px] font-bold flex items-center justify-center border border-neutral-400">
                D
              </div>
            )}
            {s.liveBet > 0 && (
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[10px] font-bold text-yellow-300 bg-neutral-900/80 px-1 rounded whitespace-nowrap">
                ${s.liveBet}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
