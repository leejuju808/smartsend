"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export type MergeCandidate = {
  master_id: string;
  duplicate_id: string;
  reason: string;
  master_name?: string | null;
  dup_name?: string | null;
};

type MergeDialogProps = {
  duplicate: MergeCandidate;
  onMerged: () => void;
};

export function MergeDialog({ duplicate, onMerged }: MergeDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleMerge = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/leads/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: duplicate.master_id,
          duplicateId: duplicate.duplicate_id,
          reason: duplicate.reason,
        }),
      });

      const payload = await res.json().catch(() => ({}));

      if (!res.ok || payload?.error) {
        throw new Error(payload?.error ?? "Failed to merge lead");
      }

      toast.success("Leads merged successfully.");
      onMerged();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to merge lead.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary">Merge</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm Merge</DialogTitle>
        </DialogHeader>
        <p>
          Merge <b>{duplicate.dup_name ?? "this lead"}</b> into{" "}
          <b>{duplicate.master_name ?? "selected lead"}</b>? This will preserve
          all messages and logs.
        </p>
        <DialogFooter>
          <Button onClick={handleMerge} disabled={loading}>
            {loading ? "Merging..." : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



