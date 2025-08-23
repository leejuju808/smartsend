"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function UpgradeBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // We read status from a tiny endpoint to avoid server re-renders everywhere
    fetch("/api/subscription/status").then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (j?.status !== "pro") setShow(true);
    }).catch(() => {});
  }, []);

  if (!show) return null;
  return (
    <div className="w-full bg-black text-white text-sm">
      <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-between">
        <span className="opacity-90">Unlock campaigns, AI writing, and automations with Pro.</span>
        <Link
          href="/dashboard/billing?upgrade=1"
          className="inline-flex items-center px-3 py-1 rounded bg-white text-black font-medium"
        >
          Upgrade →
        </Link>
      </div>
    </div>
  );
} 