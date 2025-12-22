"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export function UnsuppressButton({
  threadId,
  onUnsuppress,
}: {
  threadId: string;
  onUnsuppress?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function confirm() {
    setLoading(true);
    try {
      const resp = await fetch(`/api/thread/${threadId}/unsuppress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim() || undefined }),
      });

      if (!resp.ok) {
        const message = await resp.text();
        throw new Error(message || "Failed to unsuppress");
      }

      toast.success("Lead unsuppressed");
      setOpen(false);
      setNote("");
      onUnsuppress?.();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to unsuppress";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Unsuppress Lead
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsuppress this lead?</DialogTitle>
            <DialogDescription>
              We will reopen outreach for this thread and log the action.
              Optionally add a note for the audit log.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Add a note (optional)"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="min-h-[100px]"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirm} disabled={loading}>
              {loading ? "Unsuppressing…" : "Unsuppress"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}







