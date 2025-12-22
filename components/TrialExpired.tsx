"use client";

import Link from "next/link";

export default function TrialExpired() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center px-6">
      <div className="max-w-sm text-xs">
        <h1 className="mb-3 text-xl font-semibold">Your trial has ended</h1>
        
        <p className="mb-6 text-muted-foreground">
          Your 7-day SmartSend trial has expired. 
          Upgrade to continue sending emails, receiving replies, and generating leads.
        </p>

        <Link
          href="/dashboard/billing"
          className="rounded-full bg-primary px-6 py-2 text-xs font-semibold text-primary-foreground shadow-sm"
        >
          Upgrade to continue
        </Link>
      </div>
    </div>
  );
}


























































