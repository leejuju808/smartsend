"use client";

import React, { useEffect, useState } from "react";

const STORAGE_KEY = "smartsend_roofing_health_intro_seen";

export const RoofingJobsHealthIntroBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = window.localStorage.getItem(STORAGE_KEY);
    if (!seen) {
      setVisible(true);
    }
  }, []);

  function dismiss() {
    setVisible(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "1");
    }
  }

  if (!visible) return null;

  return (
    <div className="mb-3 flex items-start justify-between gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/5 px-3 py-3 text-xs text-emerald-100">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
          New: Roofing Job Health
        </p>
        <p className="mt-1 text-[11px]">
          This list is sorted by Health Score.{" "}
          <span className="font-semibold">
            Start with HOT jobs — these homeowners are the most ready to book a roof.
          </span>{" "}
          Use the Hot/Warm/Cold filters to build a daily call list.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="mt-1 text-[11px] text-emerald-300 hover:text-emerald-100"
      >
        Dismiss
      </button>
    </div>
  );
};















































