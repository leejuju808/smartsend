"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export function BulkToolbar({
  total,
  selectedCount,
  allSelected,
  onToggleAll,
  onCancel,
  disabled,
}: {
  total: number;
  selectedCount: number;
  allSelected: boolean;
  onToggleAll: (checked: boolean) => void;
  onCancel: () => Promise<void>;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
      <div className="flex items-center gap-3">
        <Checkbox
          checked={allSelected}
          onCheckedChange={(v) => onToggleAll(!!v)}
          aria-label="Select all"
        />
        <div className="text-sm">
          {selectedCount > 0 ? `${selectedCount} selected` : `${total} threads`}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="destructive"
          onClick={async () => {
            try {
              await onCancel();
            } catch (err) {
              console.error("Bulk cancel failed", err);
              toast.error("Action failed.");
            }
          }}
          disabled={disabled || selectedCount === 0}
        >
          Cancel nudges ({selectedCount})
        </Button>
      </div>
    </div>
  );
}

