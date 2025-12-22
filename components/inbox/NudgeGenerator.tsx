"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Preview = { subject: string; body: string };

export function NudgeGenerator({ threadId }: { threadId: string }) {
  const [tone, setTone] = React.useState("auto");
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function render() {
    if (!threadId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/thread/${threadId}/nudge/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force_tone: tone === "auto" ? undefined : tone }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        toast.error(json?.error ?? "Failed to generate nudge");
        return;
      }
      setPreview({ subject: json.subject, body: json.body });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate nudge");
    } finally {
      setLoading(false);
    }
  }

  async function queue() {
    if (!threadId) return;
    try {
      const res = await fetch(`/api/thread/${threadId}/nudge/queue`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok && res.status === 429) {
        const errorMap: Record<string, string> = {
          thread_cooldown: "Hold up — this thread is in cooldown. Try again later.",
          lead_daily_cap: "Daily cap reached for this lead today.",
          thread_not_found: "Thread not found.",
          forbidden: "You don’t have access to nudge for this campaign.",
        };
        const key = typeof json?.error === "string" ? json.error : undefined;
        toast.error((key && errorMap[key]) || "Nudge blocked by policy.");
        return;
      }
      if (!res.ok || !json?.ok) {
        toast.error(json?.error ?? "Failed to queue nudge");
        return;
      }
      toast.success(json.variant_id ? "Queued via A/B" : "Queued (legacy)");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to queue nudge");
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-950/60 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs uppercase tracking-wide text-zinc-200"
          value={tone}
          onChange={(e) => setTone(e.target.value)}
        >
          <option value="auto">Tone: Auto</option>
          <option value="professional">Professional</option>
          <option value="friendly">Friendly</option>
          <option value="concise">Concise</option>
          <option value="assertive">Assertive</option>
        </select>
        <Button variant="outline" size="sm" onClick={render} disabled={loading}>
          {loading ? "Generating…" : "Preview nudge"}
        </Button>
        <Button variant="outline" size="sm" onClick={queue}>
          Insert as draft
        </Button>
      </div>
      {preview ? (
        <div className="rounded-md border border-zinc-800 bg-zinc-950/80 p-2 text-xs">
          <div className="font-medium text-zinc-100">Subject: {preview.subject}</div>
          <pre className="mt-1 whitespace-pre-wrap text-zinc-300">{preview.body}</pre>
        </div>
      ) : null}
    </div>
  );
}

