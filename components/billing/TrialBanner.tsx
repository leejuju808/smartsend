// components/billing/TrialBanner.tsx
"use client";

import Link from "next/link";

interface TrialBannerProps {
  trialEndsAt: string;
}

export function TrialBanner({ trialEndsAt }: TrialBannerProps) {
  return (
    <div className="border rounded-2xl p-3 bg-yellow-50 text-[11px] flex items-center justify-between">
      <div>
        <span className="font-semibold">Trial active.</span>{" "}
        You have full SmartSend power until{" "}
        {new Date(trialEndsAt).toLocaleDateString()}.
      </div>
      <Link
        href="/billing"
        className="px-3 py-1 rounded-xl border text-xs"
      >
        Lock in your founder rate
      </Link>
    </div>
  );
}



























































