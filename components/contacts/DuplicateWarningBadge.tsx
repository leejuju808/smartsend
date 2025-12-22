"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";

/**
 * Badge showing duplicate count for contacts page header
 * Shows "SmartSend cleaned X duplicate contacts" message
 */
export function DuplicateWarningBadge() {
  const [duplicateCount, setDuplicateCount] = React.useState<number>(0);

  const refresh = React.useCallback(async () => {
    try {
      const r = await fetch("/api/contacts/duplicates/count", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.success) {
        setDuplicateCount(j.duplicateGroups ?? 0);
      }
    } catch (e) {
      // Silently fail
    }
  }, []);

  React.useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60000); // Refresh every minute
    return () => clearInterval(id);
  }, [refresh]);

  if (duplicateCount === 0) return null;

  return (
    <Badge
      variant="outline"
      className="bg-amber-50 text-amber-800 border-amber-200"
    >
      <AlertTriangle className="h-3 w-3 mr-1" />
      SmartSend cleaned {duplicateCount} duplicate contact{duplicateCount !== 1 ? "s" : ""}
    </Badge>
  );
}





















































