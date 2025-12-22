"use client";

import { useState } from "react";
import type { ReplyThreadNote } from "@/types/reply-inbox";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { isSalesModeEnabled } from "@/lib/feature-flags";

interface ThreadNotesProps {
  threadId: string;
  notes: ReplyThreadNote[];
  onUpdate: () => void;
}

export default function ThreadNotes({ threadId, notes, onUpdate }: ThreadNotesProps) {
  // BLOCK 281000 — Sales Mode: remove internal notes from product UI.
  if (isSalesModeEnabled()) return null;

  const [newNote, setNewNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddNote = async () => {
    if (!newNote.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/inbox/replies/${threadId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: newNote.trim() }),
      });

      if (!res.ok) {
        throw new Error("Failed to add note");
      }

      setNewNote("");
      onUpdate();
    } catch (err) {
      console.error("Failed to add note:", err);
      alert("Failed to add note. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-2">Internal Notes</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Add notes visible to your team. The customer will not see these notes.
        </p>
      </div>

      {/* Notes List */}
      {notes.length > 0 && (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} className="p-3 bg-muted/50 rounded-lg border">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  {note.authorAvatar && (
                    <img
                      src={note.authorAvatar}
                      alt={note.authorName}
                      className="w-6 h-6 rounded-full"
                    />
                  )}
                  <span className="text-sm font-medium">{note.authorName}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(note.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{note.body}</p>
            </div>
          ))}
        </div>
      )}

      {/* Add Note Form */}
      <div className="space-y-2">
        <Textarea
          placeholder="Add internal note (customer will not see this)..."
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          rows={3}
          className="resize-none"
        />
        <div className="flex justify-end">
          <Button
            onClick={handleAddNote}
            disabled={!newNote.trim() || isSubmitting}
            size="sm"
          >
            {isSubmitting ? "Adding..." : "Add Note"}
          </Button>
        </div>
      </div>
    </div>
  );
}

