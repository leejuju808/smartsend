"use client";

import * as React from "react";

function K({ label, value, suffix }: { label: string; value: number | string; suffix?: string }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">
        {value}
        {suffix ?? ""}
      </div>
    </div>
  );
}

export function KPICards({ data }: { data: any }) {
  const k = data?.kpis ?? {};
  return (
    <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
      <K label="Sends" value={k.sends ?? 0} />
      <K label="Replies" value={k.replies ?? 0} />
      <K label="Reply Rate" value={k.reply_rate ?? 0} suffix="%" />
      <K label="Opens" value={k.opens ?? 0} />
      <K label="Open Rate" value={k.open_rate ?? 0} suffix="%" />
      <K label="Bounces" value={k.bounces ?? 0} />
    </div>
  );
}


