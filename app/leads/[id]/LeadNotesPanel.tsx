"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Plus, StickyNote, Flame } from "lucide-react";

type LeadNote = {
  id: string;
  note_type: string;
  title: string | null;
  body: string;
  score_delta: number | null;
  is_pinned: boolean;
  created_at: string;
  created_by_name: string | null;
};

export function LeadNotesPanel({
  leadId,
  initialNotes,
}: {
  leadId: string;
  initialNotes: LeadNote[];
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    note_type: "context",
    title: "",
    body: "",
    score_delta: "",
    is_pinned: false,
  });

  const onChange = (key: string, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setForm({
      note_type: "context",
      title: "",
      body: "",
      score_delta: "",
      is_pinned: false,
    });
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.body.trim()) return;

    setSaving(true);
    try {
      const res = await fetch("/api/lead-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadId,
          note_type: form.note_type,
          title: form.title || null,
          body: form.body,
          score_delta: form.score_delta ? Number(form.score_delta) : null,
          is_pinned: form.is_pinned,
        }),
      });

      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      setNotes((prev) => [json.note, ...prev]);
      resetForm();
    } catch (err) {
      console.error(err);
      alert("Failed to add note");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Lead notes</h3>
        </div>
        <span className="text-[10px] text-muted-foreground">
          Feeds AI follow-ups & scoring
        </span>
      </div>

      {/* New note form */}
      <form onSubmit={handleAdd} className="space-y-3 rounded-md border bg-muted/40 p-3 text-xs">
        <div className="grid gap-2 md:grid-cols-[1.4fr,1fr]">
          <div>
            <label className="text-[11px]">Type</label>
            <Select
              value={form.note_type}
              onValueChange={(v) => onChange("note_type", v)}
            >
              <SelectTrigger className="mt-1 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="context">Context</SelectItem>
                <SelectItem value="objection">Objection</SelectItem>
                <SelectItem value="playbook_hint">Playbook hint</SelectItem>
                <SelectItem value="do_not_mention">Do not mention</SelectItem>
                <SelectItem value="priority">Priority</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[11px]">Title (optional)</label>
            <Input
              className="mt-1 h-8 text-xs"
              placeholder="e.g. Hates long-term contracts"
              value={form.title}
              onChange={(e) => onChange("title", e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="text-[11px]">Note</label>
          <Textarea
            className="mt-1 min-h-[70px] text-xs"
            placeholder="What do humans know about this lead that the AI should respect?"
            value={form.body}
            onChange={(e) => onChange("body", e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              checked={form.is_pinned}
              onCheckedChange={(v) => onChange("is_pinned", v)}
            />
            <span className="text-[11px]">Pin for AI</span>
          </div>
          <div className="flex items-center gap-1">
            <Flame className="h-3 w-3 text-amber-500" />
            <Input
              className="h-8 w-20 text-xs"
              type="number"
              placeholder="+10"
              value={form.score_delta}
              onChange={(e) => onChange("score_delta", e.target.value)}
            />
            <span className="text-[10px] text-muted-foreground">
              Score delta (optional)
            </span>
          </div>
          <Button
            type="submit"
            size="sm"
            className="ml-auto h-7 text-[11px]"
            disabled={saving}
          >
            <Plus className="mr-1 h-3 w-3" />
            {saving ? "Saving…" : "Add note"}
          </Button>
        </div>
      </form>

      {/* Notes list */}
      {notes.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          No notes yet. Add context or objections so AI can act smarter on this lead.
        </p>
      ) : (
        <div className="space-y-3">
          {notes.map((n) => (
            <div
              key={n.id}
              className={cn(
                "rounded-md border bg-card p-2.5 text-xs",
                n.is_pinned && "border-primary/50 shadow-sm",
              )}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="text-[9px] capitalize"
                  >
                    {n.note_type.replace(/_/g, " ")}
                  </Badge>
                  {n.is_pinned && (
                    <Badge
                      variant="outline"
                      className="border-primary/40 bg-primary/10 text-[9px] text-primary"
                    >
                      Pinned
                    </Badge>
                  )}
                  {n.score_delta != null && n.score_delta !== 0 && (
                    <Badge
                      variant="outline"
                      className="border-amber-500/40 bg-amber-500/10 text-[9px] text-amber-500"
                    >
                      Score {n.score_delta > 0 ? "+" : ""}
                      {n.score_delta}
                    </Badge>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(n.created_at).toLocaleDateString()}
                </span>
              </div>
              {n.title && (
                <p className="text-[11px] font-medium">{n.title}</p>
              )}
              <p className="mt-0.5 text-[11px] text-muted-foreground whitespace-pre-wrap">
                {n.body}
              </p>
              {n.created_by_name && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  by {n.created_by_name}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

