import type { ReactNode } from "react";
import { seatXY } from "../utils/positions";
import PlayingCard from "./PlayingCard";

export interface SeatRenderInfo {
  seat: number;
  position: string;
  name: string;
  stack: number | undefined;
  isHero: boolean;
  isBTN: boolean;
  isCurrent: boolean;
  isFolded: boolean;
  isShown: boolean;
  betThisStreet: number;
  cards: [string, string] | null;
  faceDown: boolean;
}

export default function PokerTable({
  totalSeats,
  seats,
  pot,
  street,
  board,
  onTapSeat,
  onTapBoardSlot,
  aspectRatio = "3/4",
  showBoard = true,
  showPot = true,
}: {
  totalSeats: number;
  seats: SeatRenderInfo[];
  pot: number;
  street: string;
  board: (string | null)[];
  onTapSeat?: (seat: number) => void;
  onTapBoardSlot?: (index: number) => void;
  aspectRatio?: string;
  showBoard?: boolean;
  showPot?: boolean;
}): ReactNode {
  return (
    <div
      className="relative w-full max-h-[60vh]"
      style={{ aspectRatio }}
    >
      <div className="absolute inset-x-2 top-[12%] bottom-[12%] rounded-[50%] bg-gradient-to-b from-felt-700 to-felt-900 border-[6px] border-neutral-900 shadow-inner" />
      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
        {showPot && (
          <>
            <div className="text-[10px] text-yellow-300 uppercase tracking-wider">
              {street}
            </div>
            <div className="text-sm font-bold text-yellow-200 mb-2">Pot {pot}</div>
          </>
        )}
        {showBoard && (
          <div className="flex gap-1 pointer-events-auto">
            {[0, 1, 2, 3, 4].map((i) => (
              <button
                key={i}
                onClick={() => onTapBoardSlot?.(i)}
                className="block"
              >
                <PlayingCard card={board[i] ?? null} size="sm" />
              </button>
            ))}
          </div>
        )}
      </div>
      {seats.map((s) => {
        const { x, y } = seatXY(s.seat, totalSeats);
        return (
          <button
            key={s.seat}
            onClick={() => onTapSeat?.(s.seat)}
            className="absolute flex flex-col items-center"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <div className="flex gap-0.5 mb-1">
              {s.cards && s.isShown ? (
                <>
                  <PlayingCard card={s.cards[0]} size="sm" dim={s.isFolded} highlight={s.isCurrent} />
                  <PlayingCard card={s.cards[1]} size="sm" dim={s.isFolded} highlight={s.isCurrent} />
                </>
              ) : (
                <>
                  <PlayingCard card={null} size="sm" faceDown dim={s.isFolded} highlight={s.isCurrent} />
                  <PlayingCard card={null} size="sm" faceDown dim={s.isFolded} highlight={s.isCurrent} />
                </>
              )}
            </div>
            {s.position && (
              <div className="text-[9px] text-neutral-200 px-1 rounded bg-neutral-900/60">
                {s.position}
              </div>
            )}
            <div className="text-[10px] font-semibold text-white">
              {s.name || "—"}
            </div>
            {s.stack !== undefined && (
              <div className="text-[9px] text-neutral-300">
                ${s.stack}
              </div>
            )}
            {s.isBTN && (
              <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white text-black text-[10px] font-bold flex items-center justify-center border border-neutral-400">
                D
              </div>
            )}
            {s.betThisStreet > 0 && (
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[10px] font-bold text-yellow-300 bg-neutral-900/80 px-1 rounded whitespace-nowrap">
                ${s.betThisStreet}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
