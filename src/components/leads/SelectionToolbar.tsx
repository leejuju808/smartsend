"use client";

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/use-toast";

export default function SelectionToolbar({
  count,
  onRetry,
  onClear
}: {
  count: number;
  onRetry: () => Promise<void>;
  onClear: () => void;
}) {
  const { toast } = useToast();

  return (
    <div className="sticky top-[52px] z-20 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900 p-3 flex items-center justify-between">
      <div className="text-sm font-medium">
        {count} selected
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={async () => {
          try { await onRetry(); }
          catch (e: any) {
            toast({ title: "Retry failed", description: e?.message ?? "Unknown error" });
          }
        }}>Retry Failed</Button>
        <Button variant="secondary" onClick={onClear}>Clear</Button>
      </div>
    </div>
  );
}


