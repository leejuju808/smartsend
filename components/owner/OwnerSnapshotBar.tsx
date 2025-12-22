"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Sparkles, Flame, CalendarCheck } from "lucide-react";

type Snapshot = {
  pipeline_value: number;
  won_value: number;
  today_hot_leads: number;
  today_jobs_booked: number;
};

export function OwnerSnapshotBar() {
  const [data, setData] = React.useState<Snapshot | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchSnapshot = async () => {
      try {
        const res = await fetch("/api/owner/snapshot");
        if (!res.ok) throw new Error("Failed to load snapshot");
        const json = await res.json();
        setData(json.data ?? null);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchSnapshot();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-4 border-b bg-muted/60 px-4 py-1.5 text-[11px] text-muted-foreground">
        <Sparkles className="h-3 w-3" />
        <span>Loading today's SmartSend snapshot…</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center gap-4 border-b bg-muted/60 px-4 py-1.5 text-[11px] text-muted-foreground">
        <Sparkles className="h-3 w-3" />
        <span>
          Once SmartSend starts generating leads and bookings, your daily snapshot will appear here.
        </span>
      </div>
    );
  }

  const { pipeline_value, won_value, today_hot_leads, today_jobs_booked } = data;
  const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 border-b px-4 py-1.5 text-[11px]",
        "bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950",
        "text-slate-100"
      )}
    >
      {/* Left: label */}
      <div className="flex items-center gap-2">
        <Sparkles className="h-3 w-3 text-amber-300" />
        <span className="font-medium tracking-[0.16em] uppercase text-[10px] text-amber-200">
          Today in SmartSend
        </span>
      </div>

      {/* Middle: metrics */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <SnapshotChip
          icon={<Flame className="h-3 w-3" />}
          label="Hot leads"
          value={today_hot_leads.toString()}
        />
        <SnapshotChip
          icon={<CalendarCheck className="h-3 w-3" />}
          label="Jobs booked today"
          value={today_jobs_booked.toString()}
        />
        <SnapshotChip
          label="Pipeline"
          value={money(pipeline_value)}
        />
        <SnapshotChip
          label="Booked"
          value={money(won_value)}
        />
      </div>

      {/* Right: small reassurance line */}
      <div className="hidden text-[10px] text-amber-100/80 sm:block">
        SmartSend is following up, classifying leads, and filling your pipeline while you run your crews.
      </div>
    </div>
  );
}

type ChipProps = {
  icon?: React.ReactNode;
  label: string;
  value: string;
};

function SnapshotChip({ icon, label, value }: ChipProps) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-slate-900/60 px-2.5 py-0.5">
      {icon && <span className="text-amber-300">{icon}</span>}
      <span className="text-[10px] text-slate-300">{label}:</span>
      <span className="text-[11px] font-semibold text-amber-200">{value}</span>
    </div>
  );
}











































