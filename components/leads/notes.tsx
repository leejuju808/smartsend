"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Pencil, Trash2, X, Check } from "lucide-react";

type Note = {
  id: string;
  lead_id: string;
  user_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
};

type NotesResponse = {
  notes: Note[];
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function LeadNotes({ leadId }: { leadId: string }) {
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data, error, isLoading, mutate } = useSWR<NotesResponse>(
    `/api/leads/${leadId}/notes`,
    fetcher
  );

  const notes = data?.notes || [];

  async function addNote() {
    if (!text.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/notes/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(error.error || "Failed to add note");
        return;
      }

      setText("");
      mutate();
    } catch (err) {
      console.error("Error adding note:", err);
      alert("Failed to add note");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function editNote(noteId: string) {
    if (!editingText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/notes/${noteId}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: editingText }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(error.error || "Failed to edit note");
        return;
      }

      setEditingId(null);
      setEditingText("");
      mutate();
    } catch (err) {
      console.error("Error editing note:", err);
      alert("Failed to edit note");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteNote(noteId: string) {
    if (!confirm("Are you sure you want to delete this note?") || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/notes/${noteId}/delete`, {
        method: "POST",
      });

      if (!res.ok) {
        const error = await res.json();
        alert(error.error || "Failed to delete note");
        return;
      }

      mutate();
    } catch (err) {
      console.error("Error deleting note:", err);
      alert("Failed to delete note");
    } finally {
      setIsSubmitting(false);
    }
  }

  function startEdit(note: Note) {
    setEditingId(note.id);
    setEditingText(note.body);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingText("");
  }

  if (error) {
    return (
      <div className="p-4 border rounded-lg bg-destructive/10 text-destructive">
        Error loading notes: {error.message || "Unknown error"}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="p-4 border rounded-lg bg-muted">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a note..."
          className="min-h-[100px]"
          disabled={isSubmitting}
        />
        <Button
          className="mt-2"
          onClick={addNote}
          disabled={!text.trim() || isSubmitting}
        >
          {isSubmitting ? "Adding..." : "Add Note"}
        </Button>
      </div>

      {isLoading ? (
        <div className="p-4 text-center text-muted-foreground">Loading notes...</div>
      ) : notes.length === 0 ? (
        <div className="p-4 text-center text-muted-foreground">No notes yet</div>
      ) : (
        notes.map((note) => (
          <Card key={note.id} className="bg-card">
            <CardContent className="p-4">
              <div className="flex justify-between items-start mb-2">
                <span className="text-sm opacity-60">
                  {new Date(note.created_at).toLocaleString()}
                  {note.updated_at !== note.created_at && " (edited)"}
                </span>
                {editingId === note.id ? (
                  <div className="flex gap-2">
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => editNote(note.id)}
                      disabled={isSubmitting}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={cancelEdit}
                      disabled={isSubmitting}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => startEdit(note)}
                      disabled={isSubmitting}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => deleteNote(note.id)}
                      disabled={isSubmitting}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              {editingId === note.id ? (
                <Textarea
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  className="min-h-[100px]"
                  disabled={isSubmitting}
                />
              ) : (
                <p className="mt-2 whitespace-pre-line">{note.body}</p>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}










