"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface LeadNoteComposerProps {
  leadId: string;
  onSaved?: () => void; // optional: to refresh timeline
}

export function LeadNoteComposer({ leadId, onSaved }: LeadNoteComposerProps) {
  const [noteType, setNoteType] = useState<"note" | "call">("note");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!body.trim()) {
      setError("Please enter a note.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noteType,
          title: title.trim() || undefined,
          body: body.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save note");
      }

      setTitle("");
      setBody("");

      if (onSaved) onSaved();
    } catch (err: any) {
      console.error("Error saving note:", err);
      setError(err.message ?? "Failed to save note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mt-6 flex flex-col gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/60 p-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-neutral-100">
            Add Internal Note
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setNoteType("note")}
              className={cn(
                "rounded-full px-3 py-1 transition-colors",
                noteType === "note"
                  ? "bg-neutral-100 text-neutral-900"
                  : "border border-neutral-700 text-neutral-300 hover:bg-neutral-800"
              )}
            >
              Note
            </button>
            <button
              type="button"
              onClick={() => setNoteType("call")}
              className={cn(
                "rounded-full px-3 py-1 transition-colors",
                noteType === "call"
                  ? "bg-neutral-100 text-neutral-900"
                  : "border border-neutral-700 text-neutral-300 hover:bg-neutral-800"
              )}
            >
              Call Log
            </button>
          </div>
        </div>

        <Input
          type="text"
          placeholder="Title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-500 focus:border-neutral-700"
        />

        <Textarea
          placeholder={
            noteType === "call"
              ? "Example: Spoke with homeowner, wants estimate next Tuesday at 3 PM…"
              : "Example: Lead is in X neighborhood, 2-story, wants full replacement…"
          }
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-500 focus:border-neutral-700 resize-none"
        />

        {error && (
          <div className="text-xs text-red-400">{error}</div>
        )}

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-neutral-200 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save Note"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

























































