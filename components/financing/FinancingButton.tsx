// Block 33155 — SmartSend Roofing "Smart Financing Engine + Homeowner Offer Flow" v1
// Component: FinancingButton
// Displays financing button that opens calculator/application flow

"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";

interface FinancingButtonProps {
  amount: number;
  leadId?: string;
  jobId?: string;
  proposalId?: string;
  workspaceId?: string;
  source?: "proposal" | "invoice" | "contract" | "email" | "follow_up";
  onOpenCalculator?: () => void;
  className?: string;
}

export function FinancingButton({
  amount,
  leadId,
  jobId,
  proposalId,
  workspaceId,
  source = "proposal",
  onOpenCalculator,
  className = "",
}: FinancingButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);

    try {
      // Log click event (Block 36555)
      await fetch("/api/financing/click", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          proposal_id: proposalId,
          lead_id: leadId,
          amount,
        }),
      });

      // Call parent handler if provided
      if (onOpenCalculator) {
        onOpenCalculator();
      }
    } catch (error) {
      console.error("Error logging financing click:", error);
      // Still call parent handler even if logging fails
      if (onOpenCalculator) {
        onOpenCalculator();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`
        inline-flex items-center gap-2 px-6 py-3 rounded-lg
        bg-gradient-to-r from-blue-600 to-blue-700 text-white
        font-medium text-sm shadow-md hover:shadow-lg
        transition-all duration-200 hover:from-blue-700 hover:to-blue-800
        disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `}
    >
      <CreditCard className="w-4 h-4" />
      {loading ? "Loading..." : "Monthly Payments Available"}
    </button>
  );
}

