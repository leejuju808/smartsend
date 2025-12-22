"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";

type InternalNote = {
  id: string;
  created_at: string;
  author_id: string;
  body: string;
};

type InternalNotesPanelProps = {
  threadId: string;
};

export function InternalNotesPanel({ threadId }: InternalNotesPanelProps) {
  const [notes, setNotes] = useState<InternalNote[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadNotes();
  }, [threadId]);

  async function loadNotes() {
    setLoading(true);
    try {
      const res = await fetch(`/api/threads/${threadId}/notes`);
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes || []);
      }
    } catch (error) {
      console.error("Failed to load notes:", error);
    } finally {
      setLoading(false);
    }
  }

  async function addNote() {
    if (!note.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/threads/${threadId}/notes/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: note }),
      });

      if (res.ok) {
        setNote("");
        await loadNotes();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to add note");
      }
    } catch (error) {
      console.error("Failed to add note:", error);
      alert("Failed to add note");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border rounded p-4 bg-muted">
      <h3 className="font-semibold mb-2">Internal Notes</h3>

      <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading notes...</div>
        ) : notes.length === 0 ? (
          <div className="text-sm text-muted-foreground">No notes yet</div>
        ) : (
          notes.map((n) => (
            <div key={n.id} className="p-2 bg-white rounded border">
              <div className="text-xs text-muted-foreground">
                {new Date(n.created_at).toLocaleString()}
              </div>
              <div className="text-sm whitespace-pre-wrap">{n.body}</div>
            </div>
          ))
        )}
      </div>

      <textarea
        className="w-full border rounded p-2 text-sm"
        placeholder="Add a note... (use @mention to tag teammates)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
      />

      <Button
        className="mt-2"
        onClick={addNote}
        disabled={!note.trim() || submitting}
        size="sm"
      >
        Add Note
      </Button>
    </div>
  );
}












