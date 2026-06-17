import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { seatXY } from "../positions";

type Direction = "up" | "down" | "left" | "right" | "allin" | null;

const DEAD_ZONE_PX = 28;
const COMMIT_THRESHOLD_PX = 56;
const ALL_IN_THRESHOLD_PX = 140;

/**
 * Drag-input overlay anchored on top of the current actor's avatar in the
 * portrait table. Pressing the avatar shows a radial menu; sliding past the
 * commit threshold in a direction confirms that action on pointer-up.
 *
 * Gesture map (legal directions glow, illegal dim):
 *   ↑  Bet / Raise — opens the bet-size sheet
 *   ↑↑ All-in     — pull further up past ALL_IN_THRESHOLD_PX, commits directly
 *   ↓  Fold
 *   ←  Check       (only when toCall == 0)
 *   →  Call        (only when toCall > 0)
 *
 * Tap = no-op (so an accidental tap doesn't fold). Release inside the dead
 * zone cancels.
 */
export default function DragInput({
  seat,
  totalSeats,
  heroSeat,
  canCheck,
  canCall,
  canBet,
  canRaise,
  toCallAmount,
  onFold,
  onCheck,
  onCall,
  onBet,
  onRaise,
  onAllIn,
}: {
  seat: number;
  totalSeats: number;
  heroSeat: number | null;
  canCheck: boolean;
  canCall: boolean;
  canBet: boolean;
  canRaise: boolean;
  toCallAmount: number;
  onFold: () => void;
  onCheck: () => void;
  onCall: () => void;
  onBet: () => void;
  onRaise: () => void;
  onAllIn: () => void;
}): ReactNode {
  const { x, y } = seatXY(seat, totalSeats, { portrait: true, heroSeat });
  const [active, setActive] = useState(false);
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const dist = Math.hypot(dx, dy);
  // Resolve the geometric direction the user is dragging in. We bias the
  // vertical axis — the up gesture is the most-used (bet/raise) so a slight
  // diagonal still counts as "up".
  const direction: Direction = (() => {
    if (!active || dist < DEAD_ZONE_PX) return null;
    if (-dy > Math.abs(dx)) {
      return -dy >= ALL_IN_THRESHOLD_PX && (canBet || canRaise) ? "allin" : "up";
    }
    if (dy > Math.abs(dx)) return "down";
    return dx < 0 ? "left" : "right";
  })();

  // Whether the current direction maps to a LEGAL action — drives the radial
  // highlight and gates commit-on-release.
  const directionLegal = (() => {
    switch (direction) {
      case "up":
        return canBet || canRaise;
      case "allin":
        return canBet || canRaise;
      case "down":
        return true; // fold always legal when it's your turn
      case "left":
        return canCheck;
      case "right":
        return canCall;
      default:
        return false;
    }
  })();

  const commit = () => {
    if (!directionLegal || dist < COMMIT_THRESHOLD_PX) {
      setActive(false);
      setDx(0);
      setDy(0);
      startRef.current = null;
      return;
    }
    switch (direction) {
      case "up":
        canBet ? onBet() : onRaise();
        break;
      case "allin":
        onAllIn();
        break;
      case "down":
        onFold();
        break;
      case "left":
        onCheck();
        break;
      case "right":
        onCall();
        break;
    }
    setActive(false);
    setDx(0);
    setDy(0);
    startRef.current = null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    startRef.current = { x: e.clientX, y: e.clientY };
    setActive(true);
    setDx(0);
    setDy(0);
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!startRef.current) return;
    setDx(e.clientX - startRef.current.x);
    setDy(e.clientY - startRef.current.y);
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    commit();
  };
  const handlePointerCancel = () => {
    setActive(false);
    setDx(0);
    setDy(0);
    startRef.current = null;
  };

  const upLabel = !canBet && !canRaise ? null : canBet ? "Bet" : "Raise";
  const allInProgress = direction === "allin";
  const allInBarPct = Math.min(
    100,
    Math.max(0, ((-dy - COMMIT_THRESHOLD_PX) / (ALL_IN_THRESHOLD_PX - COMMIT_THRESHOLD_PX)) * 100)
  );

  return (
    <>
      {/* Capture region — sits on top of the active seat avatar. Slightly
          larger than the avatar so the press target is comfortable. */}
      <div
        className="absolute z-20"
        style={{
          left: `${x}%`,
          top: `${y}%`,
          transform: "translate(-50%, -50%)",
          width: 76,
          height: 76,
          touchAction: "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {/* Subtle pulsing ring when idle so the player can see WHERE to press */}
        {!active && (
          <div className="absolute inset-0 rounded-full ring-2 ring-emerald-400/70 animate-pulse pointer-events-none" />
        )}
      </div>

      {/* Radial menu — appears on press, centred on the avatar. Lives above
          the table felt so the labels stay legible even on a busy hand. */}
      {active && (
        <div
          className="absolute z-30 pointer-events-none"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            transform: "translate(-50%, -50%)",
            width: 220,
            height: 220,
          }}
        >
          <Petal
            angle="up"
            label={upLabel ?? ""}
            sub={allInProgress ? "ALL-IN" : undefined}
            highlighted={direction === "up" || direction === "allin"}
            legal={canBet || canRaise}
          />
          <Petal
            angle="down"
            label="Fold"
            highlighted={direction === "down"}
            legal
          />
          <Petal
            angle="left"
            label="Check"
            highlighted={direction === "left"}
            legal={canCheck}
          />
          <Petal
            angle="right"
            label={canCall ? `Call ${toCallAmount}` : "Call"}
            highlighted={direction === "right"}
            legal={canCall}
          />
          {/* All-in progress bar above the avatar — fills as the user drags
              upward past the commit threshold. */}
          {(canBet || canRaise) && dy < -COMMIT_THRESHOLD_PX && (
            <div
              className="absolute left-1/2 -translate-x-1/2"
              style={{ top: 4, width: 100 }}
            >
              <div className="h-1.5 bg-neutral-700 rounded overflow-hidden">
                <div
                  className={`h-full ${allInProgress ? "bg-rose-500" : "bg-amber-400"}`}
                  style={{ width: `${allInBarPct}%` }}
                />
              </div>
              <div className="text-center text-[9px] mt-0.5 text-neutral-300">
                {allInProgress ? "離して All-in" : "さらに上に → All-in"}
              </div>
            </div>
          )}
          {/* Dead-zone hint in the very centre — the action only commits if
              the user drags out past the threshold. */}
          {dist < COMMIT_THRESHOLD_PX && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-[10px] text-neutral-400 bg-neutral-900/80 px-1.5 py-0.5 rounded">
                {dist < DEAD_ZONE_PX ? "離すとキャンセル" : "もう少し動かす…"}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Petal({
  angle,
  label,
  sub,
  highlighted,
  legal,
}: {
  angle: "up" | "down" | "left" | "right";
  label: string;
  sub?: string;
  highlighted: boolean;
  legal: boolean;
}): ReactNode {
  // Each petal is anchored to a side of the 220×220 radial canvas, slightly
  // outside the avatar so the active seat's name/cards remain readable.
  const pos: Record<typeof angle, React.CSSProperties> = {
    up: { left: "50%", top: -6, transform: "translate(-50%, 0)" },
    down: { left: "50%", bottom: -6, transform: "translate(-50%, 0)" },
    left: { left: -6, top: "50%", transform: "translate(0, -50%)" },
    right: { right: -6, top: "50%", transform: "translate(0, -50%)" },
  };
  const tone = !legal
    ? "bg-neutral-900/70 text-neutral-600 border-neutral-800"
    : highlighted
      ? "bg-emerald-500 text-white border-emerald-300 scale-110 shadow-[0_0_12px_rgba(16,185,129,0.6)]"
      : "bg-neutral-800/95 text-neutral-100 border-neutral-600";
  return (
    <div
      className={`absolute px-3 py-1.5 rounded-full border text-xs font-bold transition ${tone}`}
      style={pos[angle]}
    >
      {label}
      {sub && <span className="ml-1 text-[10px] opacity-80">{sub}</span>}
    </div>
  );
}
