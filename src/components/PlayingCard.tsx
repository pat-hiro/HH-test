import { suitSymbol } from "../utils/cards";

export default function PlayingCard({
  card,
  size = "md",
  faceDown = false,
  dim = false,
  highlight = false,
}: {
  card: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  faceDown?: boolean;
  dim?: boolean;
  highlight?: boolean;
}) {
  const sizeMap = {
    xs: "w-6 h-9 text-[10px]",
    sm: "w-8 h-12 text-sm",
    md: "w-10 h-14 text-base",
    lg: "w-12 h-16 text-lg",
  };
  const sz = sizeMap[size];
  const ring = highlight ? "ring-2 ring-emerald-400" : "";
  const opacity = dim ? "opacity-50" : "";

  if (faceDown) {
    return (
      <div
        className={`${sz} ${ring} ${opacity} rounded bg-orange-400 border border-orange-300 flex items-center justify-center`}
      />
    );
  }
  if (!card) {
    return (
      <div
        className={`${sz} ${ring} ${opacity} rounded bg-neutral-800 border border-neutral-700 flex items-center justify-center text-neutral-600`}
      >
        ?
      </div>
    );
  }
  const rank = card[0];
  const suit = card[1];
  const isRed = suit === "h" || suit === "d";
  const color = isRed ? "text-rose-500" : "text-neutral-900";
  return (
    <div
      className={`${sz} ${ring} ${opacity} rounded bg-white border border-neutral-300 flex flex-col items-center justify-center font-bold leading-none ${color}`}
    >
      <span>{rank}</span>
      <span className="text-[110%]">{suitSymbol(suit)}</span>
    </div>
  );
}
