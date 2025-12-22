"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { useRouter } from "next/navigation";

interface SeatUsageData {
  seat_usage?: {
    seats_used: number;
    seat_pct: number;
  };
  caps?: {
    seats_allowed: number;
    warning_threshold_pct: number;
  };
}

export function SeatUsageBar() {
  const [data, setData] = useState<SeatUsageData | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/billing/usage");
      if (!res.ok) return;
      const json = await res.json();
      setData(json);
    }
    load();
  }, []);

  if (!data?.seat_usage || !data?.caps) return null;

  const used = data.seat_usage.seats_used;
  const allowed = data.caps.seats_allowed;
  const pct = data.seat_usage.seat_pct;
  const warnThreshold = data.caps.warning_threshold_pct || 80;

  const warning = pct >= warnThreshold && pct < 100;
  const over = pct >= 100;

  return (
    <div className="flex items-center gap-2 mb-3">
      <Badge
        className={
          over
            ? "bg-red-800 border-red-600 text-white"
            : warning
            ? "bg-amber-800 border-amber-600 text-white"
            : "bg-slate-800 border-slate-700 text-white"
        }
      >
        {used}/{allowed} seats used
      </Badge>
      {over && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-red-400">
            Seat limit reached — upgrade to add more teammates.
          </span>
          <button
            onClick={() => router.push("/dashboard/billing")}
            className="text-xs text-red-400 underline hover:text-red-300"
          >
            Upgrade
          </button>
        </div>
      )}
      {warning && !over && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-amber-400">
            Near seat limit — consider upgrading.
          </span>
          <button
            onClick={() => router.push("/dashboard/billing")}
            className="text-xs text-amber-400 underline hover:text-amber-300"
          >
            Upgrade
          </button>
        </div>
      )}
    </div>
  );
}






