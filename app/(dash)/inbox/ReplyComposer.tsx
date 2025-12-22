"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type DraftCtx = {
  thread_id: string;
  campaign_id: string;
  lead_id: string;
  email: string;
};

export function ReplyComposer({
  draft,
  onClose,
  onSaved,
}: {
  draft: DraftCtx;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [subject, setSubject] = useState("Re: Your message");
  const [body, setBody] = useState("");
  const [presets, setPresets] = useState<any[]>([]);
  const [selPreset, setSelPreset] = useState("");
  const [tone, setTone] = useState("professional");
  const [style, setStyle] = useState("plain");
  const [maxLen, setMaxLen] = useState(450);
  const [ctaHint, setCtaHint] = useState("Propose a quick 15-min call this week.");
  const [loadingRW, setLoadingRW] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch(`/api/rewrite-presets?campaign=${draft.campaign_id}`)
      .then((r) => (r.ok ? r.json() : { presets: [] }))
      .then((j: any) => setPresets(j?.presets ?? []))
      .catch(() => setPresets([]));
  }, [draft.campaign_id]);

  function applyPreset(id: string) {
    setSelPreset(id);
    const p = presets.find((x: any) => x.id === id);
    if (!p) return;
    if (p.tone) setTone(p.tone);
    if (p.style) setStyle(p.style);
    if (p.max_len) setMaxLen(p.max_len);
    if (p.cta_hint) setCtaHint(p.cta_hint);
  }

  async function save(): Promise<string | null> {
    const res = await fetch(`/api/thread/${draft.thread_id}/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaign_id: draft.campaign_id,
        lead_id: draft.lead_id,
        subject,
        body,
      }),
    });

    if (!res.ok) {
      return null;
    }

    const json = await res.json().catch(() => ({}));
    return json?.draft_id ?? null;
  }

  async function sendNow() {
    setSending(true);

    try {
      // 1) Save/update the draft first to ensure latest edits persist
      const draftId = await save();

      // 2) Call send endpoint (falls back to latest draft if save failed)
      const res = await fetch(`/api/thread/${draft.thread_id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          draftId
            ? { draft_id: draftId, provider: true }
            : { use_latest: true, provider: true }
        ),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: "Failed to send" }));
        alert(json.error ?? "Failed to send");
        return;
      }

      onSaved();
    } finally {
      setSending(false);
    }
  }

  async function rewrite() {
    setLoadingRW(true);
    try {
      const res = await fetch(`/api/rewrite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: draft.thread_id,
          campaign_id: draft.campaign_id,
          subject,
          body,
          tone,
          style,
          max_len: Math.min(Math.max(Number.isFinite(maxLen) ? maxLen : 300, 80), 1200),
          cta_hint: ctaHint,
          preset_id: selPreset || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: "rewrite failed" }));
        alert(j.error ?? "Rewrite failed");
        return;
      }
      const j = await res.json().catch(() => ({}));
      if (typeof j?.rewritten === "string" && j.rewritten.length > 0) {
        setBody(j.rewritten);
      }
    } finally {
      setLoadingRW(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-background p-4 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-lg font-semibold">Reply to {draft.email}</div>
          <button className="text-sm text-muted-foreground" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="grid gap-3">
          <label className="text-sm">Subject</label>
          <input
            className="rounded-md border p-2 text-sm"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <select
              className="h-9 rounded-md border px-2 text-sm"
              value={selPreset}
              onChange={(e) => applyPreset(e.target.value)}
            >
              <option value="">Preset…</option>
              {presets.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.tone})
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border px-2 text-sm"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
            >
              <option value="professional">Professional</option>
              <option value="friendly">Friendly</option>
              <option value="concise">Concise</option>
              <option value="assertive">Assertive</option>
            </select>
            <select
              className="h-9 rounded-md border px-2 text-sm"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
            >
              <option value="plain">Plain</option>
              <option value="paragraph">Paragraph</option>
              <option value="bullet">Bullet</option>
            </select>
            <input
              className="h-9 rounded-md border px-2 text-sm"
              type="number"
              min={80}
              max={1200}
              value={maxLen}
              onChange={(e) => {
                const next = Number(e.target.value);
                setMaxLen(Number.isFinite(next) ? next : 80);
              }}
            />
          </div>

          <input
            className="rounded-md border p-2 text-sm"
            placeholder="CTA hint (optional)"
            value={ctaHint}
            onChange={(e) => setCtaHint(e.target.value)}
          />

          <label className="text-sm">Body</label>
          <textarea
            className="h-56 w-full rounded-md border p-2 text-sm"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />

          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" disabled={loadingRW} onClick={rewrite}>
              {loadingRW ? "Rewriting…" : "Rewrite with AI"}
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                const id = await save();
                if (id === null) {
                  alert("Failed to save draft");
                  return;
                }
                onSaved();
              }}
            >
              Save Draft
            </Button>
            <Button disabled={sending} onClick={sendNow}>
              {sending ? "Sending…" : "Send Now"}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

