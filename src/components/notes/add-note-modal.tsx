"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";

export function AddNoteModal({
  open,
  onClose,
  threadId,
}: {
  open: boolean;
  onClose: () => void;
  threadId: string;
}) {
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!body.trim()) {
      alert("Note body is required");
      return;
    }

    setLoading(true);
    try {
      const workspaceId = localStorage.getItem("active_wid") || 
        new URLSearchParams(window.location.search).get("wid");
      
      const res = await fetch("/api/notes/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-workspace-id": workspaceId || "",
        },
        body: JSON.stringify({ thread_id: threadId, body: body.trim() }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create note");
      }

      // Reset form
      setBody("");
      onClose();
    } catch (error) {
      console.error("Error creating note:", error);
      alert(error instanceof Error ? error.message : "Failed to create note");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="space-y-4 max-w-md">
        <DialogHeader>
          <DialogTitle>Add Note</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <Textarea
            placeholder="Write a note... use @name to mention a teammate"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSave();
              }
            }}
          />
          <p className="text-xs text-muted-foreground">
            Use @username to mention teammates. Press Cmd/Ctrl+Enter to save.
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || !body.trim()}>
            {loading ? "Saving..." : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}










