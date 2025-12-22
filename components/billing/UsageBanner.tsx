"use client";

import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import Link from "next/link";

export function UsageBanner() {
  const { workspace, loading } = useCurrentWorkspace();

  if (loading || !workspace) return null;

  const used = workspace.email_used_this_period ?? 0;
  const limit = workspace.email_limit_monthly ?? 0;

  if (!limit) return null; // safety

  const percent = Math.min(100, Math.round((used / limit) * 100));

  let tone: "ok" | "warn" | "danger" = "ok";
  if (percent >= 70 && percent < 90) tone = "warn";
  if (percent >= 90) tone = "danger";

  const bgClass =
    tone === "danger"
      ? "bg-red-50 border-red-200"
      : tone === "warn"
      ? "bg-amber-50 border-amber-200"
      : "bg-slate-50 border-slate-200";

  const barClass =
    tone === "danger"
      ? "bg-red-500"
      : tone === "warn"
      ? "bg-amber-500"
      : "bg-slate-800";

  return (
    <div className={`mb-4 rounded-2xl border px-4 py-3 ${bgClass}`}>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <div className="text-xs text-gray-500">
            Plan:{" "}
            <span className="font-semibold uppercase">
              {workspace.plan_key}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <div className="h-2 w-40 rounded-full bg-white/80 overflow-hidden">
              <div
                className={`h-full ${barClass}`}
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="text-xs text-gray-600">
              {used} / {limit} emails this period
            </div>
          </div>
          {workspace.billing_period_ends_at && (
            <div className="text-[10px] text-gray-400 mt-0.5">
              Renews on{" "}
              {new Date(workspace.billing_period_ends_at).toLocaleDateString()}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 justify-end">
          {percent >= 70 && (
            <span className="text-[11px] text-gray-600">
              {percent >= 90
                ? "You're almost out of sends. Upgrade to keep campaigns running."
                : "You're nearing your monthly send limit."}
            </span>
          )}
          <Link
            href="/billing"
            className="text-xs font-semibold px-3 py-1.5 rounded-xl border bg-white hover:bg-slate-50"
          >
            Manage Plan
          </Link>
        </div>
      </div>
    </div>
  );
}
