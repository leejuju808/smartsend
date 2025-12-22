"use client";

import React, { useEffect, useState } from "react";

type HealthRow = {
  sender_email: string;
  paused: boolean;
  daily_cap_start: number;
  daily_cap_max: number;
  daily_cap_step: number;
  warmup_start_date: string;
  hard_bounce_threshold: number;
  soft_bounce_threshold: number;
  complaint_threshold: number;
  sends_today: number;
  hard_bounces_today: number;
  soft_bounces_today: number;
  complaints_today: number;
  health_color: "red" | "yellow" | "green";
};

export default function SenderHealthBadge({ senderEmail }: { senderEmail: string }) {
  const [row, setRow] = useState<HealthRow | null>(null);
  const [cap, setCap] = useState<number>(0);

  function calcCap(r: HealthRow) {
    const start = new Date(r.warmup_start_date + "T00:00:00Z");
    const today = new Date();
    const diffDays = Math.max(0, Math.floor((today.getTime() - start.getTime()) / 86400000));
    const c = Math.min(r.daily_cap_max, r.daily_cap_start + diffDays * r.daily_cap_step);
    return c;
  }

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/send-safety/health?sender_email=${encodeURIComponent(senderEmail)}`);
      if (res.ok) {
        const data = await res.json();
        setRow(data.row || null);
        if (data.row) setCap(calcCap(data.row));
      }
    })();
  }, [senderEmail]);

  if (!row) return null;

  const color =
    row.health_color === "red" ? "bg-red-100 text-red-800 border-red-200" :
    row.health_color === "yellow" ? "bg-yellow-100 text-yellow-800 border-yellow-200" :
    "bg-emerald-100 text-emerald-800 border-emerald-200";

  const label =
    row.health_color === "red" ? "Health: RED — Paused/Unsafe" :
    row.health_color === "yellow" ? "Health: YELLOW — Caution" :
    "Health: GREEN — Good";

  const tip = `Cap today: ${cap} • Sent: ${row.sends_today} • Soft: ${row.soft_bounces_today} • Hard: ${row.hard_bounces_today} • Complaints: ${row.complaints_today}`;

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-xl border ${color}`} title={tip}>
      <span className="h-2 w-2 rounded-full bg-current opacity-80" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}
