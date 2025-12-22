// Block 20130 — Internal Notes Card

"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";

interface InternalNotesCardProps {
  conversationId: string;
  initialNotes?: string | null;
  onUpdated?: (convoPatch: any) => void;
}

export function InternalNotesCard({
  conversationId,
  initialNotes,
  onUpdated,
}: InternalNotesCardProps) {
  const [note, setNote] = useState(initialNotes || "");
  const [saving, setSaving] = useState(false);

  async function saveNote() {
    if (!note.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/inbox/note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId, note }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to save note");
      }

      const json = await res.json();
      setSaving(false);
      if (json?.conversation && onUpdated) {
        onUpdated(json.conversation);
      }
    } catch (error) {
      console.error("Failed to save note:", error);
      setSaving(false);
      alert("Failed to save note. Please try again.");
    }
  }

  return (
    <Card className="border-l-4 border-l-purple-500">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <FileText className="w-5 h-5 text-purple-600" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-base font-semibold">Internal notes</CardTitle>
            <p className="text-xs text-gray-500 mt-1">Team-only notes</p>
          </div>
          {saving && (
            <span className="text-[10px] text-gray-400">Saving…</span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Notes only your team can see (insurance details, special requests, pricing, etc.)"
          className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />

        <div className="flex justify-end">
          <Button
            type="button"
            onClick={saveNote}
            disabled={saving || !note.trim()}
            size="sm"
            className="px-4 py-1.5 text-xs"
            variant="outline"
          >
            {saving ? "Saving..." : "Save note"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

















































