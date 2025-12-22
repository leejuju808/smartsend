"use client";

import Link from "next/link";

export type UpgradeGateReason = "cap" | "paid-only" | "feature";

interface UpgradeGateProps {
  reason?: UpgradeGateReason;
  message?: string;
  className?: string;
}

export function UpgradeGate({ 
  reason = "paid-only", 
  message,
  className = ""
}: UpgradeGateProps) {
  const defaultMessages: Record<UpgradeGateReason, string> = {
    cap: "You've hit your free send cap. Upgrade to Pro for higher caps and faster warmup.",
    "paid-only": "This feature is Pro only. Upgrade to unlock.",
    feature: "Unlock this feature with a Pro subscription.",
  };

  const text = message || defaultMessages[reason];

  return (
    <div className={`rounded-2xl border p-5 bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-950/20 dark:to-orange-950/20 ${className}`}>
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
          <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            Upgrade Required
          </h3>
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
            {text}
          </p>
          <div className="mt-4">
            <Link
              href="/dashboard/billing"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-medium text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Upgrade to Pro
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Inline upgrade prompt - smaller, less intrusive
 */
export function UpgradePrompt({ 
  message = "Upgrade to Pro to unlock this feature",
  className = ""
}: { message?: string; className?: string }) {
  return (
    <div className={`rounded-xl border p-4 bg-yellow-50 dark:bg-yellow-950/20 flex items-center justify-between ${className}`}>
      <div className="flex items-center gap-3">
        <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {message}
        </span>
      </div>
      <Link
        href="/dashboard/billing"
        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors text-sm font-medium"
      >
        Upgrade
      </Link>
    </div>
  );
}
