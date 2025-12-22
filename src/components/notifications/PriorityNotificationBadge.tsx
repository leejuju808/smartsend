/**
 * PriorityNotificationBadge Component
 * Displays notification priority badge with appropriate styling
 */

"use client";

import { AlertCircle, AlertTriangle, Info } from "lucide-react";

interface PriorityNotificationBadgeProps {
  priority: "critical" | "important" | "standard";
  className?: string;
}

export function PriorityNotificationBadge({
  priority,
  className = "",
}: PriorityNotificationBadgeProps) {
  const getPriorityConfig = () => {
    switch (priority) {
      case "critical":
        return {
          bgColor: "bg-red-100",
          textColor: "text-red-800",
          icon: AlertCircle,
          label: "CRITICAL",
        };
      case "important":
        return {
          bgColor: "bg-orange-100",
          textColor: "text-orange-800",
          icon: AlertTriangle,
          label: "IMPORTANT",
        };
      case "standard":
        return {
          bgColor: "bg-blue-100",
          textColor: "text-blue-800",
          icon: Info,
          label: "STANDARD",
        };
      default:
        return {
          bgColor: "bg-gray-100",
          textColor: "text-gray-800",
          icon: Info,
          label: "STANDARD",
        };
    }
  };

  const config = getPriorityConfig();
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.textColor} ${className}`}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}






































