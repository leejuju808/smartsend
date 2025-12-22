// Block 36555 — SmartSend Roofing "Smart Financing Engine + Instant Pre-Qual" v1
// Component: Financing Status Badge for Pipeline

"use client";

import { CreditCard, CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface FinancingStatusBadgeProps {
  status: {
    clicked?: boolean;
    started?: boolean;
    prequalified?: boolean;
    approved?: boolean;
    declined?: boolean;
    abandoned?: boolean;
    monthly_payment?: number | null;
    plan_length?: number | null;
  } | null;
  className?: string;
  variant?: "compact" | "full";
}

export function FinancingStatusBadge({
  status,
  className = "",
  variant = "compact",
}: FinancingStatusBadgeProps) {
  if (!status) {
    return null;
  }

  let label = "";
  let icon = CreditCard;
  let colorClass = "text-gray-400";
  let bgClass = "bg-gray-100";

  if (status.approved) {
    label = "Financing Approved";
    icon = CheckCircle;
    colorClass = "text-green-700";
    bgClass = "bg-green-100";
  } else if (status.declined) {
    label = "Financing Declined";
    icon = XCircle;
    colorClass = "text-red-700";
    bgClass = "bg-red-100";
  } else if (status.prequalified) {
    label = "Pre-qualified";
    icon = CheckCircle;
    colorClass = "text-blue-700";
    bgClass = "bg-blue-100";
  } else if (status.started) {
    label = "Application Started";
    icon = Clock;
    colorClass = "text-yellow-700";
    bgClass = "bg-yellow-100";
  } else if (status.clicked) {
    label = "Financing Clicked";
    icon = AlertCircle;
    colorClass = "text-gray-700";
    bgClass = "bg-gray-100";
  } else {
    return null;
  }

  const Icon = icon;

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs",
          colorClass,
          bgClass,
          className
        )}
        title={label}
      >
        <Icon className="h-3 w-3" />
        {status.approved && status.monthly_payment && (
          <span>${status.monthly_payment.toLocaleString()}/mo</span>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm",
        colorClass,
        bgClass,
        className
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="font-medium">{label}</span>
      {status.monthly_payment && (
        <span className="text-xs opacity-75">
          ${status.monthly_payment.toLocaleString()}/mo
          {status.plan_length && ` • ${status.plan_length}mo`}
        </span>
      )}
    </div>
  );
}
































