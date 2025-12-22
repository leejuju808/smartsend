"use client";

import Link from "next/link";

interface MeterProps {
  label: string;
  used: number;
  max: number | null;
  percent: number | null;
}

export default function UsageMeter({ label, used, max, percent }: MeterProps) {
  if (max === null) return null; // unlimited → no meter

  // Ensure percent is valid (0-100)
  const displayPercent = percent != null ? Math.min(Math.max(percent, 0), 100) : 0;

  let barColor = "bg-emerald-600";

  if (displayPercent > 80) barColor = "bg-red-600";
  else if (displayPercent > 60) barColor = "bg-yellow-500";

  return (
    <div className="mb-4 rounded-xl border bg-card px-4 py-3 text-xs shadow-sm">
      <div className="flex justify-between items-center mb-1 text-[11px]">
        <span className="font-medium">{label}</span>
        <span className="font-semibold">
          {used.toLocaleString()}/{max.toLocaleString()}
        </span>
      </div>

      <div className="h-2 w-full rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${displayPercent}%` }}
        />
      </div>

      {displayPercent >= 80 && (
        <div className="mt-2 text-red-600 text-[10px] font-medium flex justify-between items-center">
          <span>You're running low.</span>
          <Link
            href="/dashboard/billing"
            className="underline underline-offset-2 hover:text-red-700"
          >
            Upgrade
          </Link>
        </div>
      )}
    </div>
  );
}

