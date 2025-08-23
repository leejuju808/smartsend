"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function TrialBadge() {
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/subscription/status")
      .then((r) => r.json())
      .then((j) => {
        if (j.status === "pro" && j.trial_end) {
          const end = new Date(j.trial_end).getTime();
          const now = Date.now();
          const diff = Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
          setDaysLeft(diff);
        }
      })
      .catch(() => {});
  }, []);

  if (daysLeft === null) return null;
  if (daysLeft === 0) return null; // already expired

  return (
    <div className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2">
      Trial: {daysLeft} {daysLeft === 1 ? "day" : "days"} left
      <Link
        href="/dashboard/billing"
        className="ml-2 underline font-semibold hover:text-yellow-900"
      >
        Upgrade now →
      </Link>
    </div>
  );
} 