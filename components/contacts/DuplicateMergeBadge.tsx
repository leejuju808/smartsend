"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Merge } from "lucide-react";

/**
 * Badge showing recent merge count for dashboard/contacts page
 * Shows "X duplicates cleaned this week" message
 */
export function DuplicateMergeBadge() {
  const [recentMerges, setRecentMerges] = React.useState<number>(0);
  const router = useRouter();

  const refresh = React.useCallback(async () => {
    try {
      const r = await fetch("/api/contacts/duplicates/count", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.success) {
        setRecentMerges(j.recentMerges ?? 0);
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

  if (recentMerges === 0) return null;

  return (
    <Badge
      variant="secondary"
      className="bg-green-100 text-green-800 hover:bg-green-200 cursor-pointer"
      onClick={() => router.push("/contacts/merge")}
    >
      <Merge className="h-3 w-3 mr-1" />
      {recentMerges} duplicate{recentMerges !== 1 ? "s" : ""} cleaned this week
    </Badge>
  );
}





















































