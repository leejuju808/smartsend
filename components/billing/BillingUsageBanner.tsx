"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, AlertOctagon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BillingUsage = {
  plan_code: string;
  caps: {
    daily_send_cap: number;
    daily_reply_cap: number;
    per_sender_daily_cap: number;
    seats_allowed: number;
    warning_threshold_pct: number;
    hard_stop: boolean;
  } | null;
  usage_today: {
    sends: number;
    replies: number;
    send_pct: number;
    reply_pct: number;
  } | null;
  seat_usage: {
    seats_used: number;
    seat_pct: number;
  } | null;
  warnings: {
    show: boolean;
    nearSendCap?: boolean;
    sendOverCap?: boolean;
    nearSeatCap?: boolean;
    seatOverCap?: boolean;
  };
};

export function BillingUsageBanner() {
  const [data, setData] = useState<BillingUsage | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/billing/usage");
      if (!res.ok) return;
      const json = await res.json();
      setData(json);
    };

    load();
  }, []);

  if (!data || hidden) return null;

  const { warnings, usage_today, caps, seat_usage } = data;
  if (!warnings?.show || !usage_today || !caps || !seat_usage) return null;

  const { nearSendCap, sendOverCap, nearSeatCap, seatOverCap } = warnings;

  const isHard = sendOverCap || seatOverCap;
  const Icon = isHard ? AlertOctagon : AlertTriangle;

  const sendPct = usage_today.send_pct;
  const sendCap = caps.daily_send_cap;
  const sends = usage_today.sends;

  const seatsUsed = seat_usage.seats_used;
  const seatCap = caps.seats_allowed;
  const seatPct = seat_usage.seat_pct;

  let primaryMsg = "";
  let secondaryMsg = "";

  if (sendOverCap) {
    primaryMsg = "Daily send limit reached.";
    secondaryMsg = `You've sent ${sends} emails today (100% of your ${sendCap} daily cap). Sending is paused until your quota resets or you upgrade.`;
  } else if (nearSendCap) {
    primaryMsg = "You're close to your daily send limit.";
    secondaryMsg = `You've used ${sendPct}% of your daily send cap (${sends}/${sendCap} emails). Consider upgrading if you plan more volume today.`;
  } else if (seatOverCap) {
    primaryMsg = "You're over your seat limit.";
    secondaryMsg = `You have ${seatsUsed} users on a plan that includes ${seatCap} seats. Some features may be restricted until you upgrade.`;
  } else if (nearSeatCap) {
    primaryMsg = "You're close to your seat limit.";
    secondaryMsg = `You're using ${seatPct}% of your allowed seats (${seatsUsed}/${seatCap}).`;
  }

  return (
    <div
      className={cn(
        "w-full border-b px-3 py-2 text-xs flex items-center justify-between gap-3",
        isHard
          ? "bg-red-900/40 border-red-700 text-red-50"
          : "bg-amber-900/40 border-amber-700 text-amber-50"
      )}
    >
      <div className="flex items-start gap-2">
        <Icon className="h-4 w-4 mt-[2px]" />
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-[11px]">{primaryMsg}</span>
          <span className="text-[11px] opacity-90">{secondaryMsg}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="xs"
          variant="outline"
          className="h-7 px-2 text-[11px]"
          asChild
        >
          <a href="/dashboard/billing/usage">View usage</a>
        </Button>
        <Button
          size="xs"
          className="h-7 px-2 text-[11px]"
          asChild
        >
          <a href="/dashboard/billing">Upgrade plan</a>
        </Button>
        <button
          className="text-[10px] opacity-70 hover:opacity-100"
          onClick={() => setHidden(true)}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}






