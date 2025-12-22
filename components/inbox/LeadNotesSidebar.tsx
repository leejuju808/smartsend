"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type LeadNote = {
  id: string;
  body: string;
  next_step: string | null;
  follow_up_at: string | null;
  created_at: string;
  user_id: string;
};

type LeadNotesSidebarProps = {
  leadId: string;
};

/**
 * Block 12200 — SmartSend Roofing Notes System v1
 * Displays lead notes in inbox thread sidebar
 */
export function LeadNotesSidebar({ leadId }: LeadNotesSidebarProps) {
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotes();
  }, [leadId]);

  async function loadNotes() {
    try {
      const res = await fetch(`/api/leads/${leadId}/notes`);
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

  if (loading) {
    return (
      <div className="rounded-2xl border p-3">
        <h3 className="text-sm font-medium mb-2">Notes</h3>
        <div className="text-xs text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border p-3">
      <h3 className="text-sm font-medium mb-2">Notes</h3>
      <div className="space-y-2 max-h-[40vh] overflow-auto mb-3">
        {notes.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-4">
            No notes yet.
          </div>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="text-sm border-b pb-2 last:border-0">
              <div className="text-[11px] text-muted-foreground mb-1">
                {new Date(note.created_at).toLocaleString()}
              </div>
              <div className="whitespace-pre-wrap text-xs">{note.body}</div>
              {note.next_step && (
                <div className="text-xs text-blue-600 font-medium mt-1">
                  Next: {note.next_step}
                </div>
              )}
              {note.follow_up_at && (
                <div className="text-xs text-purple-600 font-medium mt-1">
                  Follow-up: {new Date(note.follow_up_at).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}





















































