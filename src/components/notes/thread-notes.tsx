"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AddNoteModal } from "./add-note-modal";
import { renderMentions } from "@/lib/notes/utils";

type Note = {
  id: string;
  body: string;
  mentions: string[];
  created_at: string;
  updated_at: string;
  user_id: string;
  profiles: {
    email: string;
    full_name: string | null;
  } | null;
};

export function ThreadNotes({ threadId }: { threadId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  useEffect(() => {
    if (threadId) {
      loadNotes();
    }
  }, [threadId]);

  const loadNotes = async () => {
    try {
      const workspaceId = localStorage.getItem("active_wid") || 
        new URLSearchParams(window.location.search).get("wid");
      
      const res = await fetch(`/api/notes/thread/${threadId}?wid=${workspaceId}`);
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes || []);
      }
    } catch (error) {
      console.error("Error loading notes:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    if (!confirm("Delete this note?")) return;

    try {
      const workspaceId = localStorage.getItem("active_wid") || 
        new URLSearchParams(window.location.search).get("wid");
      
      const res = await fetch(`/api/notes/${noteId}/delete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-workspace-id": workspaceId || "",
        },
      });

      if (res.ok) {
        loadNotes();
      } else {
        const error = await res.json();
        alert(error.error || "Failed to delete note");
      }
    } catch (error) {
      console.error("Error deleting note:", error);
      alert("Failed to delete note");
    }
  };

  const handleEdit = (note: Note) => {
    setEditingId(note.id);
    setEditBody(note.body);
  };

  const handleSaveEdit = async (noteId: string) => {
    try {
      const workspaceId = localStorage.getItem("active_wid") || 
        new URLSearchParams(window.location.search).get("wid");
      
      const res = await fetch(`/api/notes/${noteId}/update`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-workspace-id": workspaceId || "",
        },
        body: JSON.stringify({ body: editBody }),
      });

      if (res.ok) {
        setEditingId(null);
        setEditBody("");
        loadNotes();
      } else {
        const error = await res.json();
        alert(error.error || "Failed to update note");
      }
    } catch (error) {
      console.error("Error updating note:", error);
      alert("Failed to update note");
    }
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading notes...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-sm">Notes</h3>
        <Button
          size="xs"
          variant="outline"
          onClick={() => setAddModalOpen(true)}
        >
          + Add Note
        </Button>
      </div>

      {notes.length === 0 && (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      )}

      {notes.map((note) => (
        <Card key={note.id} className="p-3">
          <CardContent className="p-0 space-y-1">
            <div className="flex justify-between items-start">
              <span className="font-medium text-sm">
                {note.profiles?.full_name || note.profiles?.email || "Unknown"}
              </span>
              <span className="opacity-50 text-xs">
                {formatDateTime(note.created_at)}
              </span>
            </div>

            {editingId === note.id ? (
              <div className="space-y-2">
                <textarea
                  className="w-full p-2 border rounded text-sm bg-background"
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={3}
                />
                <div className="flex gap-2">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => {
                      setEditingId(null);
                      setEditBody("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="xs"
                    onClick={() => handleSaveEdit(note.id)}
                  >
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p
                  className="text-sm whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{
                    __html: renderMentions(note.body),
                  }}
                />
                <div className="flex gap-3 text-xs opacity-60 mt-1">
                  <button
                    onClick={() => handleEdit(note)}
                    className="hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(note.id)}
                    className="hover:underline text-destructive"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ))}

      <AddNoteModal
        threadId={threadId}
        open={addModalOpen}
        onClose={() => {
          setAddModalOpen(false);
          loadNotes();
        }}
      />
    </div>
  );
}










