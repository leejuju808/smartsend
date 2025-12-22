"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

function Delta({ v }: { v: number }) {
  const pos = v > 0;
  const Icon = pos ? ArrowUpRight : ArrowDownRight;
  const cls = pos ? "text-emerald-600" : v === 0 ? "text-muted-foreground" : "text-red-600";
  return (
    <div className={`flex items-center gap-1 text-xs ${cls}`}>
      <Icon className="h-3.5 w-3.5" />
      {v > 0 ? `+${v}` : v}
    </div>
  );
}

function RateDelta({ v }: { v: number }) {
  const pos = v > 0;
  const Icon = pos ? ArrowUpRight : ArrowDownRight;
  const cls = pos ? "text-emerald-600" : v === 0 ? "text-muted-foreground" : "text-red-600";
  return (
    <div className={`flex items-center gap-1 text-xs ${cls}`}>
      <Icon className="h-3.5 w-3.5" />
      {v > 0 ? `+${v.toFixed(2)}%` : `${v.toFixed(2)}%`}
    </div>
  );
}

function K({ label, value, suffix, delta, rate }: {
  label: string; value: number | string; suffix?: string; delta?: number; rate?: boolean;
}) {
  return (
    <div className="rounded-xl border p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">
        {value}
        {suffix ?? ""}
      </div>
      {typeof delta === "number" && (rate ? <RateDelta v={delta} /> : <Delta v={delta} />)}
    </div>
  );
}

export function OverviewCards({ data }: { data: any }) {
  const k = data?.kpis ?? data ?? {};
  return (
    <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
      <K label="Sends" value={k.sends ?? 0} delta={k.send_delta ?? 0} />
      <K label="Replies" value={k.replies ?? 0} delta={k.reply_delta ?? 0} />
      <K label="Reply Rate" value={k.reply_rate ?? 0} suffix="%" delta={k.reply_rate_delta ?? 0} rate />
      <K label="Opens" value={k.opens ?? 0} delta={k.open_delta ?? 0} />
      <K label="Bounces" value={k.bounces ?? 0} delta={k.bounce_delta ?? 0} />
    </div>
  );
}

