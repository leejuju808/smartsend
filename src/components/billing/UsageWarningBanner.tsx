/**
 * BLOCK 100000 — Usage Warning Banner Component
 * 
 * Displays warnings when users are approaching or have hit their email limits
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, X, TrendingUp } from "lucide-react";

interface UsageWarning {
  type: "error" | "warning" | "info";
  message: string;
  remaining: number;
}

export function UsageWarningBanner() {
  const [warning, setWarning] = useState<UsageWarning | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    async function fetchWarning() {
      try {
        const response = await fetch("/api/billing/usage-warning");
        if (response.ok) {
          const data = await response.json();
          if (data.warning) {
            setWarning(data.warning);
          }
        }
      } catch (error) {
        console.error("Failed to fetch usage warning:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchWarning();
  }, []);

  if (loading || !warning || dismissed) {
    return null;
  }

  const getStyles = () => {
    switch (warning.type) {
      case "error":
        return {
          bg: "bg-red-50 border-red-200",
          text: "text-red-800",
          icon: <AlertCircle className="h-5 w-5 text-red-600" />,
          button: "bg-red-600 hover:bg-red-700 text-white",
        };
      case "warning":
        return {
          bg: "bg-yellow-50 border-yellow-200",
          text: "text-yellow-800",
          icon: <AlertCircle className="h-5 w-5 text-yellow-600" />,
          button: "bg-yellow-600 hover:bg-yellow-700 text-white",
        };
      default:
        return {
          bg: "bg-blue-50 border-blue-200",
          text: "text-blue-800",
          icon: <TrendingUp className="h-5 w-5 text-blue-600" />,
          button: "bg-blue-600 hover:bg-blue-700 text-white",
        };
    }
  };

  const styles = getStyles();

  return (
    <div className={`${styles.bg} border-l-4 ${styles.text} p-4 mb-4 rounded-md`}>
      <div className="flex items-start">
        <div className="flex-shrink-0">{styles.icon}</div>
        <div className="ml-3 flex-1">
          <p className="text-sm font-medium">{warning.message}</p>
          {warning.type !== "error" && (
            <div className="mt-2">
              <Link
                href="/billing?upgrade=true"
                className={`inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md ${styles.button} transition-colors`}
              >
                Upgrade Plan
              </Link>
            </div>
          )}
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="ml-auto flex-shrink-0 text-gray-400 hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Upgrade Prompt Banner
 * Shows upsell messages for plan features
 */
export function UpgradePromptBanner({ plan = "growth" }: { plan?: "growth" | "domination" }) {
  const planFeatures = {
    growth: {
      title: "⭐ Growth Plan includes priority support + 2,000 emails/mo.",
      description: "Upgrade to unlock more emails and priority support.",
      cta: "Upgrade to Growth",
    },
    domination: {
      title: "🚀 Domination Plan: Highest email limits + VIP onboarding",
      description: "Get higher email limits, advanced AI, and VIP support.",
      cta: "Upgrade to Domination",
    },
  };

  const features = planFeatures[plan];

  return (
    <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-purple-900">{features.title}</p>
          <p className="text-xs text-purple-700 mt-1">{features.description}</p>
        </div>
        <Link
          href={`/billing?plan=${plan}`}
          className="ml-4 px-4 py-2 text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-md transition-colors whitespace-nowrap"
        >
          {features.cta}
        </Link>
      </div>
    </div>
  );
}



















