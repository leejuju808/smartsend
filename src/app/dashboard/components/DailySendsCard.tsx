"use client";
import { useEffect, useState } from "react";
import UpgradeModal from "./UpgradeModal";

type Usage = {
  plan: "free" | "pro" | string;
  limit: number;
  usedToday: number;
  remaining: number;
  atCap: boolean;
  quiet?: { active: boolean; resumeAtISO: string };
};

export default function DailySendsCard({ userId }: { userId: string }) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUpgrade, setShowUpgrade] = useState(false);

  useEffect(() => {
    const run = async () => {
      try {
        const r = await fetch(`/api/sending/policy?userId=${userId}`, { cache: "no-store" });
        const j = await r.json();
        setUsage(j);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [userId]);

  if (loading) {
    return (
      <div className="p-4 rounded-2xl shadow bg-white">
        <div className="h-5 w-28 bg-gray-200 rounded mb-3" />
        <div className="h-3 w-full bg-gray-200 rounded" />
      </div>
    );
  }

  if (!usage) return null;

  const pct = Math.min(100, Math.round((usage.usedToday / (usage.limit || 1)) * 100));

  return (
    <div className="p-4 rounded-2xl shadow bg-white">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Daily Sends</h3>
        <span className="text-sm px-2 py-1 rounded-full bg-gray-100">
          Plan: {usage.plan}
        </span>
      </div>

      <div className="mt-3">
        <div className="h-3 w-full bg-gray-200 rounded">
          <div
            className="h-3 rounded"
            style={{ width: `${pct}%`, background: "linear-gradient(90deg,#60a5fa,#34d399)" }}
          />
        </div>
        <div className="mt-2 text-sm text-gray-600">
          {usage.usedToday} / {usage.limit} used today
        </div>

        {usage.quiet?.active ? (
          <div className="mt-3 p-3 rounded-xl bg-blue-50 text-blue-800 text-sm">
            Quiet hours are active. Sending resumes at {new Date(usage.quiet.resumeAtISO).toLocaleTimeString()}.
          </div>
        ) : usage.atCap ? (
          <div className="mt-3 p-3 rounded-xl bg-red-50 text-red-700 text-sm">
            You’ve hit today’s limit. Upgrade to continue sending.
            <button
              onClick={() => setShowUpgrade(true)}
              className="ml-3 inline-flex items-center px-3 py-1.5 rounded-xl bg-red-600 text-white"
            >
              Upgrade
            </button>
          </div>
        ) : null}
      </div>

      {showUpgrade && <UpgradeModal userId={userId} onClose={() => setShowUpgrade(false)} />}
    </div>
  );
}

