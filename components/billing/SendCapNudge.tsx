"use client";

import Link from "next/link";
import { useBillingUsageSummary } from "@/lib/hooks/useBillingUsageSummary";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ArrowRight } from "lucide-react";

export function SendCapNudge() {
  const { data, loading } = useBillingUsageSummary();

  if (loading) return null;

  const usage = data?.usage;
  if (!usage) return null;

  const status = usage.send_cap_status; // "ok" | "near" | "reached"

  if (status === "ok") return null;

  const sendsToday = usage.sends_today;
  const cap = usage.daily_send_cap;

  const ratioText =
    cap && cap > 0 ? `${sendsToday} / ${cap}` : `${sendsToday}`;

  const isReached = status === "reached";

  const title = isReached
    ? "Daily send cap reached"
    : "You're close to your daily send cap";

  const description = isReached
    ? "New sends from this workspace may be paused until the cap resets. Upgrade to raise your daily limit."
    : "Once you hit your daily cap, new sends from this workspace will pause until tomorrow. Upgrade to increase your limit.";

  const badgeText = isReached ? "Cap reached" : "Near cap";

  return (
    <Card className={isReached ? "border-red-800 bg-red-950/40" : "border-amber-800 bg-amber-950/40"}>
      <CardContent className="p-3 flex items-start gap-3 text-xs">
        <AlertTriangle
          className={
            "h-4 w-4 mt-0.5 " +
            (isReached ? "text-red-400" : "text-amber-400")
          }
        />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={
                "font-semibold " + (isReached ? "text-red-100" : "text-amber-100")
              }
            >
              {title}
            </span>
            <Badge
              className={
                (isReached
                  ? "bg-red-900/80 border-red-600"
                  : "bg-amber-900/80 border-amber-600") + " text-[10px]"
              }
            >
              {badgeText}
            </Badge>
          </div>
          <p
            className={
              "text-[11px] mt-1 " +
              (isReached ? "text-red-100/80" : "text-amber-100/80")
            }
          >
            Sends today: {ratioText}. {description}
          </p>
          <div className="mt-2">
            <Link
              href="/dashboard/billing"
              className={
                "inline-flex items-center gap-1 text-[11px] font-medium " +
                (isReached
                  ? "text-red-100 hover:text-red-50"
                  : "text-amber-100 hover:text-amber-50")
              }
            >
              View billing & upgrade
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}





