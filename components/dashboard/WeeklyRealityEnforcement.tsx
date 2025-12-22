"use client";

import { useEffect, useMemo, useState } from "react";

type HealthStatus = "healthy" | "watch" | "unhealthy";

export function WeeklyRealityEnforcement({
  weekKey,
  snapshotLine,
  lowResults,
  healthStatus,
}: {
  weekKey: string;
  snapshotLine: string | null;
  lowResults: boolean;
  healthStatus: HealthStatus;
}) {
  const storage = useMemo(
    () => ({
      weeklyKey: `smartsend_weekly_reality_seen_${weekKey}`,
      exposureKey: "smartsend_reality_exposure_count",
    }),
    [weekKey]
  );

  const [showWeekly, setShowWeekly] = useState(false);
  const [exposureCount, setExposureCount] = useState<number | null>(null);

  useEffect(() => {
    try {
      const seen = window.localStorage.getItem(storage.weeklyKey);
      if (!seen) {
        setShowWeekly(true);
        window.localStorage.setItem(storage.weeklyKey, "1");
      }
    } catch {
      // ignore
    }
  }, [storage.weeklyKey]);

  useEffect(() => {
    if (!lowResults) return;

    try {
      const raw = window.localStorage.getItem(storage.exposureKey);
      const current = raw ? Number(raw) : 0;
      const next = Number.isFinite(current) ? current + 1 : 1;
      window.localStorage.setItem(storage.exposureKey, String(next));
      setExposureCount(next);
    } catch {
      // ignore
    }
  }, [lowResults, storage.exposureKey]);

  const showIdentityCorrection = (exposureCount ?? 0) >= 3;

  const statusCopy =
    healthStatus === "healthy"
      ? {
          label: "SmartSend Health: Healthy",
          detail:
            "No panic. Ignore vibes. Ignore noise. Run your day off the scoreboard.",
          className: "border-emerald-500/40 text-emerald-200",
        }
      : healthStatus === "watch"
        ? {
            label: "SmartSend Health: Watch",
            detail:
              "Something’s drifting. Fix inputs before you listen to anyone’s opinion.",
            className: "border-amber-500/40 text-amber-200",
          }
        : {
            label: "SmartSend Health: Unhealthy",
            detail:
              "This is not a feeling. This is data. Fix the system until the numbers recover.",
            className: "border-red-500/40 text-red-200",
          };

  return (
    <div className="space-y-2">
      <div
        className={[
          "w-fit rounded-xl border bg-neutral-950/60 px-3 py-2 text-xs font-semibold",
          statusCopy.className,
        ].join(" ")}
      >
        <div className="uppercase tracking-wide">{statusCopy.label}</div>
        <div className="mt-1 font-normal text-neutral-300">
          {statusCopy.detail}
        </div>
      </div>

      {showWeekly && snapshotLine ? (
        <div className="text-sm text-neutral-200">{snapshotLine}</div>
      ) : null}

      {showIdentityCorrection ? (
        <div className="text-sm font-semibold text-neutral-100">
          SmartSend is infrastructure. If it stopped, you’d rebuild it.
        </div>
      ) : null}
    </div>
  );
}




