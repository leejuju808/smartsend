"use client";

import { useEffect, useState } from "react";

type Note = {
  id: string;
  content: string;
  mentions: string[];
  created_at: string;
  users: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
};

export function LeadNotes({ leadId }: { leadId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [mentions, setMentions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function loadNotes() {
    try {
      const res = await fetch(`/api/lead-notes/list?lead_id=${leadId}`);
      if (!res.ok) throw new Error("Failed to load notes");
      const data = await res.json();
      setNotes(data);
    } catch (err) {
      console.error("Failed to load notes:", err);
    } finally {
      setLoading(false);
    }
  }

  async function submitNote() {
    if (!content.trim()) return;
    setSaving(true);

    try {
      const res = await fetch("/api/lead-notes/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadId,
          content,
          mentions
        })
      });

      if (!res.ok) throw new Error("Failed to save note");

      setContent("");
      setMentions([]);
      await loadNotes();
    } catch (err) {
      console.error("Failed to save note:", err);
      alert("Failed to add note");
    } finally {
      setSaving(false);
    }
  }

  // Parse @mentions from content
  useEffect(() => {
    const mentionRegex = /@(\w+)/g;
    const matches = content.match(mentionRegex);
    if (matches) {
      // Extract usernames (simplified - in production you'd want to match user IDs)
      // For now, we'll extract and store them, but you'd need to resolve to user IDs
      setMentions([]); // TODO: Resolve @mentions to user IDs
    } else {
      setMentions([]);
    }
  }, [content]);

  useEffect(() => {
    loadNotes();
  }, [leadId]);

  // Format mentions in content
  const formatContent = (text: string) => {
    const parts = text.split(/(@\w+)/g);
    return parts.map((part, i) => {
      if (part.startsWith("@")) {
        return (
          <span key={i} className="text-yellow-500 font-semibold">
            {part}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="space-y-4">
      {/* Add note */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-3">
        <textarea
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Add an internal note @owner @estimator…"
          className="w-full bg-black/40 border border-white/10 text-xs text-gray-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
        />

        <div className="flex items-center justify-between mt-2">
          <div className="text-[11px] text-gray-500">
            Notes are internal and appear in the timeline.
          </div>
          <button
            onClick={submitNote}
            disabled={saving || !content.trim()}
            className="px-3 py-1 rounded-lg bg-yellow-500 text-black text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-yellow-600 transition-colors"
          >
            {saving ? "Saving…" : "Add Note"}
          </button>
        </div>
      </div>

      {/* Notes list */}
      <div className="space-y-2">
        {loading && (
          <div className="text-xs text-gray-400">Loading notes…</div>
        )}

        {!loading && notes.length === 0 && (
          <div className="text-xs text-gray-500">No notes yet.</div>
        )}

        {notes.map((n) => (
          <div
            key={n.id}
            className="rounded-lg bg-black/30 border border-white/10 p-3"
          >
            <div className="text-xs text-gray-300 whitespace-pre-line">
              {formatContent(n.content)}
            </div>
            <div className="flex justify-between mt-2">
              <div className="text-[10px] text-gray-500">
                {n.users?.full_name || n.users?.email || "Unknown"}
              </div>
              <div className="text-[10px] text-gray-500">
                {new Date(n.created_at).toLocaleString()}
              </div>
            </div>
            {n.mentions && n.mentions.length > 0 && (
              <div className="mt-1 text-[10px] text-yellow-500/70">
                Mentions: {n.mentions.length} user{n.mentions.length !== 1 ? "s" : ""}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}










































