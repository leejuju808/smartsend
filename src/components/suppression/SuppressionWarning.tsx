"use client";

import { AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface SuppressionWarningProps {
  suppressedCount: number;
  totalCount?: number;
  className?: string;
}

export function SuppressionWarning({
  suppressedCount,
  totalCount,
  className = "",
}: SuppressionWarningProps) {
  if (suppressedCount === 0) return null;

  return (
    <div
      className={`bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-start gap-2 ${className}`}
    >
      <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-medium text-orange-900">
          {suppressedCount} contact{suppressedCount !== 1 ? "s" : ""} suppressed
        </p>
        <p className="text-xs text-orange-700 mt-1">
          {totalCount
            ? `${suppressedCount} of ${totalCount} contacts are suppressed and won't receive emails.`
            : "These contacts are suppressed and won't receive emails."}
        </p>
      </div>
    </div>
  );
}





















































