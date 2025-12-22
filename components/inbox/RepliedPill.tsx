import * as React from "react";

type RepliedPillProps = {
  label: string | null;
};

export default function RepliedPill({ label }: RepliedPillProps) {
  const text = label ? `Replied • ${label}` : "Replied";
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
      {text}
    </span>
  );
}

