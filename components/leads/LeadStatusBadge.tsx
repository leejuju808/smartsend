"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type RoofingLeadStatus = 
  | "NEW" 
  | "HOT" 
  | "WARM" 
  | "FOLLOW_UP" 
  | "NOT_INTERESTED" 
  | "OUT_OF_SCOPE"
  | null
  | undefined;

interface LeadStatusBadgeProps {
  status: RoofingLeadStatus;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const statusConfig: Record<
  Exclude<RoofingLeadStatus, null | undefined>,
  { label: string; color: string; bgColor: string; textColor: string }
> = {
  NEW: {
    label: "New",
    color: "bg-green-100 text-green-800 border-green-300",
    bgColor: "bg-green-100",
    textColor: "text-green-800",
  },
  HOT: {
    label: "Hot",
    color: "bg-red-100 text-red-800 border-red-300",
    bgColor: "bg-red-100",
    textColor: "text-red-800",
  },
  WARM: {
    label: "Warm",
    color: "bg-yellow-100 text-yellow-800 border-yellow-300",
    bgColor: "bg-yellow-100",
    textColor: "text-yellow-800",
  },
  FOLLOW_UP: {
    label: "Follow Up",
    color: "bg-blue-100 text-blue-800 border-blue-300",
    bgColor: "bg-blue-100",
    textColor: "text-blue-800",
  },
  NOT_INTERESTED: {
    label: "Not Interested",
    color: "bg-gray-100 text-gray-800 border-gray-300",
    bgColor: "bg-gray-100",
    textColor: "text-gray-800",
  },
  OUT_OF_SCOPE: {
    label: "Out of Scope",
    color: "bg-black text-white border-black",
    bgColor: "bg-black",
    textColor: "text-white",
  },
};

const sizeClasses = {
  sm: "px-1.5 py-0.5 text-xs",
  md: "px-2.5 py-0.5 text-xs",
  lg: "px-3 py-1 text-sm",
};

export function LeadStatusBadge({
  status,
  className,
  size = "md",
}: LeadStatusBadgeProps) {
  if (!status) {
    return null;
  }

  const config = statusConfig[status];
  if (!config) {
    return null;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-semibold transition-colors",
        config.color,
        sizeClasses[size],
        className
      )}
    >
      {config.label}
    </span>
  );
}























































