"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

export function ExportCsvButton({ viewId, disabled }: { viewId?: string; disabled?: boolean }) {
  const handleClick = React.useCallback(() => {
    if (!viewId) return;
    const url = `/api/saved-views/${viewId}/export`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [viewId]);

  return (
    <Button variant="outline" disabled={!viewId || disabled} onClick={handleClick}>
      Export CSV
    </Button>
  );
}



