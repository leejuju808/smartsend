"use client";

import { useEffect, useState } from "react";
import { Sparkles, X, ArrowRight } from "lucide-react";
import Link from "next/link";

interface EligibilityData {
  eligible: boolean;
  is_founder: boolean;
  already_converted: boolean;
  eligibility_details?: {
    first_homeowner_reply_at?: string;
    first_warm_lead_at?: string;
    first_job_value_shown_at?: string;
  };
}

export function FoundersDealBanner() {
  const [eligibility, setEligibility] = useState<EligibilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    checkEligibility();
  }, []);

  const checkEligibility = async () => {
    try {
      const res = await fetch("/api/founders/check-eligibility");
      const data = await res.json();
      setEligibility(data);
      
      // Check if user has dismissed this banner before
      const wasDismissed = localStorage.getItem("founders_deal_dismissed");
      if (wasDismissed) {
        setDismissed(true);
      }
    } catch (error) {
      console.error("Error checking founders deal eligibility:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    // Store dismissal in localStorage
    localStorage.setItem("founders_deal_dismissed", "true");
  };

  const handleSendOffer = async () => {
    try {
      await fetch("/api/founders/send-offer", { method: "POST" });
    } catch (error) {
      console.error("Error sending offer:", error);
    }
  };

  // Don't show if loading, dismissed, already converted, or not eligible
  if (loading || dismissed || !eligibility?.eligible || eligibility.already_converted || eligibility.is_founder) {
    return null;
  }

  return (
    <div className="relative bg-gradient-to-r from-yellow-900/90 to-yellow-800/90 border-2 border-yellow-500 rounded-xl p-6 mb-6 shadow-lg">
      <button
        onClick={handleDismiss}
        className="absolute top-4 right-4 text-yellow-300 hover:text-yellow-100 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-5 h-5" />
      </button>

      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <Sparkles className="w-8 h-8 text-yellow-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-bold text-yellow-200 mb-2">
            🎉 Founders Deal Available
          </h3>
          <p className="text-yellow-100 mb-4">
            Since you're part of the first 10 roofing companies testing SmartSend, 
            you unlock a lifetime rate. Price will never increase for you.
          </p>
          
          {/* Show what triggered eligibility */}
          {eligibility.eligibility_details && (
            <div className="text-sm text-yellow-200/80 mb-4">
              {eligibility.eligibility_details.first_homeowner_reply_at && (
                <p>✓ You've received homeowner replies</p>
              )}
              {eligibility.eligibility_details.first_warm_lead_at && (
                <p>✓ You've generated warm leads</p>
              )}
              {eligibility.eligibility_details.first_job_value_shown_at && (
                <p>✓ Your dashboard shows job value</p>
              )}
            </div>
          )}

          <Link
            href="/pricing/founders?founder=true"
            onClick={handleSendOffer}
            className="inline-flex items-center gap-2 bg-yellow-500 text-black px-6 py-3 rounded-lg font-semibold hover:bg-yellow-400 transition-colors"
          >
            Claim Founders Rate
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

