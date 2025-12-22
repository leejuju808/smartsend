"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { Loader2 } from "lucide-react";

interface AddNoteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  onNoteAdded: () => void;
}

export function AddNoteModal({
  open,
  onOpenChange,
  contactId,
  onNoteAdded,
}: AddNoteModalProps) {
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!body.trim()) {
      setError("Note body is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/contacts/${contactId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to add note");
      }

      setBody("");
      onNoteAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add note");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Note</DialogTitle>
          <DialogDescription>
            Add a note to this contact's timeline
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Enter your note..."
            rows={6}
            disabled={loading}
          />
          {error && (
            <div className="text-sm text-red-500">{error}</div>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setBody("");
                setError(null);
                onOpenChange(false);
              }}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading || !body.trim()}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Adding...
                </>
              ) : (
                "Add Note"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}





























































