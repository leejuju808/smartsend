"use client";

import Link from "next/link";

export default function UpgradeBanner({ reason }: { reason: string }) {
  if (!reason) return null;

  return (
    <div className="mb-4 rounded-xl border border-yellow-500 bg-yellow-500/10 px-4 py-3 text-xs text-yellow-700 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{reason}</p>

        <Link
          href="/dashboard/billing"
          className="rounded-full bg-yellow-600 px-3 py-[5px] text-[11px] font-semibold text-white shadow transition hover:-translate-y-[0.5px] hover:shadow-md"
        >
          Upgrade plan
        </Link>
      </div>
    </div>
  );
}


























































