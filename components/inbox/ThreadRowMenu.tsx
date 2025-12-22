"use client";

import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

type ThreadRowMenuProps = {
  threadId: string;
  isNudged: boolean;
  onCancelled?: () => void;
};

export default function ThreadRowMenu({ threadId, isNudged, onCancelled }: ThreadRowMenuProps) {
  const [loading, setLoading] = React.useState(false);

  async function cancelNudge() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/thread/${threadId}/nudge/cancel`, { method: "POST" });
      const body = await res.json().catch(() => ({ ok: false, error: "cancel_failed" }));

      if (!body?.ok) {
        const error = body?.error;
        if (error === "forbidden") {
          toast.error("No permission to cancel.");
        } else if (error === "thread_not_found") {
          toast.error("Thread not found.");
        } else {
          toast.error("Failed to cancel nudge.");
        }
        return;
      }

      if (body.found) {
        toast.success("Nudge canceled.");
        onCancelled?.();
      } else {
        toast("No draft nudge to cancel.");
      }
    } catch (error) {
      console.error("Failed to cancel nudge", error);
      toast.error("Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Row actions"
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          disabled={loading}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem onClick={cancelNudge} disabled={loading || !isNudged}>
          Cancel nudge
        </DropdownMenuItem>
        <DropdownMenuCheckboxItem checked={isNudged} disabled>
          Nudged
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


