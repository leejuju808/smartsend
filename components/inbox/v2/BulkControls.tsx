// Block 13300 — Bulk Thread Controls Component

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Circle,
  Ban,
} from "lucide-react";

type BulkControlsProps = {
  selectedIds: Set<string>;
  onBulkAction: (
    action: string,
    value?: string
  ) => Promise<void>;
  onClearSelection: () => void;
};

export function BulkControls({
  selectedIds,
  onBulkAction,
  onClearSelection,
}: BulkControlsProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  if (selectedIds.size === 0) {
    return null;
  }

  const handleAction = async (action: string, value?: string) => {
    setIsProcessing(true);
    try {
      await onBulkAction(action, value);
      onClearSelection();
    } catch (error) {
      console.error("Bulk action failed:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="border-t bg-blue-50 p-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">
          {selectedIds.size} selected
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          disabled={isProcessing}
        >
          Clear
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleAction("mark_read")}
          disabled={isProcessing}
        >
          <CheckCircle2 className="w-4 h-4 mr-1" />
          Mark Read
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => handleAction("mark_unread")}
          disabled={isProcessing}
        >
          <Circle className="w-4 h-4 mr-1" />
          Mark Unread
        </Button>

        <select
          onChange={(e) => {
            if (e.target.value) {
              handleAction("update_intent", e.target.value);
              e.target.value = "";
            }
          }}
          disabled={isProcessing}
          className="px-2 py-1 text-xs border rounded"
        >
          <option value="">Update Status</option>
          <option value="HOT">HOT</option>
          <option value="WARM">WARM</option>
          <option value="FOLLOW_UP">Follow Up</option>
          <option value="NOT_INTERESTED">Not Interested</option>
        </select>

        <Button
          variant="outline"
          size="sm"
          onClick={() => handleAction("suppress", "true")}
          disabled={isProcessing}
        >
          <Ban className="w-4 h-4 mr-1" />
          Suppress
        </Button>
      </div>
    </div>
  );
}

