"use client";

import React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";

interface ThreadMismatchWarningProps {
  threadId: string;
  onResolved?: () => void;
}

/**
 * Block 19700 — Thread Mismatch Warning
 * Shows warning when messages appear to be mis-threaded
 */
export function ThreadMismatchWarning({ threadId, onResolved }: ThreadMismatchWarningProps) {
  const [showModal, setShowModal] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [action, setAction] = React.useState<"split" | "assign" | "ignore" | null>(null);
  const { toast } = useToast();

  async function handleAction(selectedAction: "split" | "assign" | "ignore") {
    setAction(selectedAction);
    setLoading(true);

    try {
      const res = await fetch(`/api/inbox/threads/${threadId}/resolve-mismatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: selectedAction }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to resolve mismatch");
      }

      toast({
        description: `Thread mismatch ${selectedAction === "ignore" ? "ignored" : "resolved"}`,
      });

      setShowModal(false);
      onResolved?.();
    } catch (error: any) {
      toast({
        description: error.message || "Failed to resolve mismatch",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setAction(null);
    }
  }

  return (
    <>
      <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
        <AlertTriangle className="h-4 w-4 text-yellow-600" />
        <AlertDescription className="flex items-center justify-between">
          <span>⚠️ Possible conversation mix-up</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowModal(true)}
            className="ml-4"
          >
            Fix
          </Button>
        </AlertDescription>
      </Alert>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Thread Mismatch</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            We think some messages in this thread belong to a different conversation.
            How would you like to proceed?
          </p>
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleAction("split")}
              disabled={loading}
            >
              Split thread (create new thread for mismatched messages)
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleAction("assign")}
              disabled={loading}
            >
              Assign to another contact
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleAction("ignore")}
              disabled={loading}
            >
              Ignore (clear warning)
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

