import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";

export default function TopBar({
  title,
  back,
  right,
}: {
  title: string;
  back?: string | (() => void);
  right?: ReactNode;
}) {
  const nav = useNavigate();
  return (
    <div className="sticky top-0 z-20 bg-neutral-950/95 backdrop-blur border-b border-neutral-800 flex items-center px-3 py-2 gap-2">
      {back !== undefined && (
        <button
          onClick={() => {
            if (typeof back === "function") back();
            else nav(back);
          }}
          className="px-2 py-1 text-neutral-300"
        >
          ←
        </button>
      )}
      <h1 className="text-base font-semibold flex-1 truncate">{title}</h1>
      {right}
    </div>
  );
}
