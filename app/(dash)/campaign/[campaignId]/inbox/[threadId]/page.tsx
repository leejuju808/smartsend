"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

type Msg = {
  message_id: string;
  direction: "inbound" | "outbound";
  sent_at: string;
  subject: string | null;
  body_text: string | null;
  ai_label: string | null;
};

export default function ThreadDetail() {
  const { campaignId, threadId } = useParams() as { campaignId: string; threadId: string };
  const router = useRouter();
  const [msgs, setMsgs] = React.useState<Msg[]>([]);
  const [draft, setDraft] = React.useState<{ id?: string; subject?: string; body: string }>({ body: "" });
  const [meta, setMeta] = React.useState<{ lead_id?: string }>({});
  const [templates, setTemplates] = React.useState<any[]>([]);
  const [showRewrite, setShowRewrite] = React.useState(false);
  const [vars, setVars] = React.useState<any>({
    lead: {},
    me: {},
    campaign: {},
  });
  const [preset, setPreset] = React.useState<{
    tone: string;
    length: "short" | "medium" | "long";
    formality: "informal" | "neutral" | "formal";
    cta?: string;
    rules?: string;
  }>({
    tone: "professional",
    length: "short",
    formality: "neutral",
  });

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, threadId]);

  React.useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  async function load() {
    const [m, d, t, v] = await Promise.all([
      fetch(`/api/thread/${threadId}/messages`).then((r) => r.json()).catch(() => ({ items: [] })),
      fetch(`/api/thread/${threadId}/draft`).then((r) => r.json()).catch(() => ({ draft: null })),
      fetch(`/api/campaign/${campaignId}/inbox/list?assigned=any&snoozed=show&needs=any&q=${threadId}`)
        .then((r) => r.json())
        .catch(() => ({ items: [] })),
      fetch(`/api/thread/${threadId}/vars`).then((r) => r.json()).catch(() => ({ vars: {} })),
    ]);
    setMsgs(m.items ?? []);
    if (d?.draft) setDraft({ id: d.draft.id, subject: d.draft.subject ?? "", body: d.draft.body ?? "" });

    const item = (t.items ?? []).find((x: any) => x.id === threadId);
    if (item) setMeta({ lead_id: item.lead_id });

    if (v?.vars) {
      const leadFirst = typeof v.vars.first_name === "string" ? v.vars.first_name : "";
      const leadLast = typeof v.vars.last_name === "string" ? v.vars.last_name : "";
      const leadName = [leadFirst, leadLast].filter(Boolean).join(" ").trim() || leadFirst || leadLast || "";
      setVars({
        lead: {
          first_name: leadFirst,
          last_name: leadLast,
          name: leadName,
          company: typeof v.vars.company === "string" ? v.vars.company : "",
          email: typeof v.vars.lead_email === "string" ? v.vars.lead_email : "",
          title: typeof v.vars.title === "string" ? v.vars.title : "",
        },
        me: {
          name: typeof v.vars.sender_name === "string" ? v.vars.sender_name : "",
          email: typeof v.vars.sender_email === "string" ? v.vars.sender_email : "",
        },
        campaign: {
          name: typeof v.vars.campaign_name === "string" ? v.vars.campaign_name : "",
          offer: "",
        },
      });
    }
  }

  async function loadTemplates() {
    const json = await fetch(`/api/campaign/${campaignId}/templates`).then((r) => r.json()).catch(() => ({ items: [] }));
    setTemplates(json.items ?? []);
  }

  async function applyTemplate(templateId: string) {
    if (!templateId) return;
    const tpl = templates.find((x: any) => x.id === templateId);
    if (!tpl) return;
    setDraft((d) => ({
      ...d,
      subject: tpl.subject ?? d.subject ?? "",
      body: render(tpl.body),
    }));
  }

  function render(s: string) {
    return s
      .replace(/\{\{\s*lead\.first_name\s*\}\}/gi, vars.lead?.first_name ?? "")
      .replace(/\{\{\s*lead\.company\s*\}\}/gi, vars.lead?.company ?? "")
      .replace(/\{\{\s*me\.name\s*\}\}/gi, vars.me?.name ?? "")
      .replace(/\{\{\s*campaign\.offer\s*\}\}/gi, vars.campaign?.offer ?? "");
  }

  async function rewriteNow() {
    const res = await fetch(`/api/rewrite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaign_id: campaignId,
        original: draft.body,
        subject: draft.subject,
        ...preset,
        vars,
      }),
    }).then((r) => r.json());
    if (res?.rewritten) {
      setDraft((d) => ({ ...d, body: res.rewritten }));
    }
  }

  const lastInboundId = React.useMemo(() => {
    const copy = [...msgs];
    for (let i = copy.length - 1; i >= 0; i -= 1) {
      if (copy[i]?.direction === "inbound") {
        return copy[i]?.message_id;
      }
    }
    return undefined;
  }, [msgs]);

  async function saveDraft() {
    if (!meta.lead_id) return;
    await fetch(`/api/thread/${threadId}/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaign_id: campaignId,
        lead_id: meta.lead_id,
        subject: draft.subject,
        body: draft.body,
        source_message_id: lastInboundId,
      }),
    });
  }

  async function send() {
    if (!meta.lead_id) return;
    await fetch(`/api/thread/${threadId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaign_id: campaignId,
        lead_id: meta.lead_id,
        subject: draft.subject,
        body: draft.body,
        draft_id: draft.id,
        source_message_id: lastInboundId,
      }),
    });
    router.push(`/campaign/${campaignId}/inbox`);
  }

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft, meta]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold">Thread {threadId.slice(0, 8)}…</div>
        <Link href={`/campaign/${campaignId}/inbox`} className="text-sm underline">
          Back to Inbox
        </Link>
      </div>

      <div className="rounded-2xl border divide-y">
        {msgs.map((m) => (
          <div key={m.message_id} className="p-3">
            <div className="text-xs text-muted-foreground">
              {m.direction.toUpperCase()} • {new Date(m.sent_at).toLocaleString()} {m.ai_label ? `• ${m.ai_label}` : ""}
            </div>
            {m.subject && <div className="text-sm font-medium">{m.subject}</div>}
            <div className="mt-1 whitespace-pre-wrap text-sm">{m.body_text ?? ""}</div>
          </div>
        ))}
        {!msgs.length && <div className="p-6 text-sm text-muted-foreground">No messages yet.</div>}
      </div>

      <div className="space-y-2 rounded-2xl border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-md border p-2 text-sm"
            onChange={(e) => {
              applyTemplate(e.target.value);
              e.currentTarget.value = "";
            }}
          >
            <option value="">Insert template…</option>
            {templates.map((t: any) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <button className="rounded-md border px-3 py-2 text-sm" onClick={() => setShowRewrite((v) => !v)}>
            ✨ Rewrite
          </button>
        </div>

        {showRewrite && (
          <div className="grid grid-cols-1 gap-3 rounded-xl border p-3 md:grid-cols-3">
            <div className="space-y-2">
              <div className="text-xs font-medium">Tone</div>
              <select
                className="w-full rounded-md border p-2 text-sm"
                value={preset.tone}
                onChange={(e) =>
                  setPreset((p) => ({
                    ...p,
                    tone: e.target.value,
                  }))
                }
              >
                <option value="professional">professional</option>
                <option value="friendly">friendly</option>
                <option value="concise">concise</option>
                <option value="warm">warm</option>
                <option value="assertive">assertive</option>
                <option value="casual">casual</option>
              </select>

              <div className="mt-2 text-xs font-medium">Length</div>
              <select
                className="w-full rounded-md border p-2 text-sm"
                value={preset.length}
                onChange={(e) =>
                  setPreset((p) => ({
                    ...p,
                    length: e.target.value as typeof preset.length,
                  }))
                }
              >
                <option value="short">short</option>
                <option value="medium">medium</option>
                <option value="long">long</option>
              </select>

              <div className="mt-2 text-xs font-medium">Formality</div>
              <select
                className="w-full rounded-md border p-2 text-sm"
                value={preset.formality}
                onChange={(e) =>
                  setPreset((p) => ({
                    ...p,
                    formality: e.target.value as typeof preset.formality,
                  }))
                }
              >
                <option value="neutral">neutral</option>
                <option value="informal">informal</option>
                <option value="formal">formal</option>
              </select>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium">CTA (optional)</div>
              <input
                className="w-full rounded-md border p-2 text-sm"
                placeholder="E.g., 'Open to a 10-min intro next week?'"
                onChange={(e) =>
                  setPreset((p) => ({
                    ...p,
                    cta: e.target.value || undefined,
                  }))
                }
              />
              <div className="mt-2 text-xs font-medium">Rules</div>
              <input
                className="w-full rounded-md border p-2 text-sm"
                placeholder="No fluff, 1 ask, 3 lines max"
                onChange={(e) =>
                  setPreset((p) => ({
                    ...p,
                    rules: e.target.value || undefined,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium">Variables</div>
              <input
                className="w-full rounded-md border p-2 text-sm"
                placeholder="Lead first name"
                value={vars.lead?.first_name ?? ""}
                onChange={(e) =>
                  setVars((v: any) => ({
                    ...v,
                    lead: {
                      ...v.lead,
                      first_name: e.target.value,
                    },
                  }))
                }
              />
              <input
                className="w-full rounded-md border p-2 text-sm"
                placeholder="Lead company"
                value={vars.lead?.company ?? ""}
                onChange={(e) =>
                  setVars((v: any) => ({
                    ...v,
                    lead: {
                      ...v.lead,
                      company: e.target.value,
                    },
                  }))
                }
              />
              <input
                className="w-full rounded-md border p-2 text-sm"
                placeholder="Your name"
                value={vars.me?.name ?? ""}
                onChange={(e) =>
                  setVars((v: any) => ({
                    ...v,
                    me: {
                      ...v.me,
                      name: e.target.value,
                    },
                  }))
                }
              />
              <input
                className="w-full rounded-md border p-2 text-sm"
                placeholder="Offer"
                value={vars.campaign?.offer ?? ""}
                onChange={(e) =>
                  setVars((v: any) => ({
                    ...v,
                    campaign: {
                      ...v.campaign,
                      offer: e.target.value,
                    },
                  }))
                }
              />
              <button className="mt-2 rounded-md border px-3 py-2 text-sm" onClick={rewriteNow}>
                Apply rewrite
              </button>
            </div>
          </div>
        )}

        <Input
          placeholder="Subject (optional)"
          value={draft.subject ?? ""}
          onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
        />
        <Textarea
          rows={8}
          placeholder="Write your reply…"
          value={draft.body}
          onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={send}>Send (⌘/Ctrl + Enter)</Button>
          <Button variant="outline" onClick={saveDraft}>
            Save draft
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              const until = new Date(Date.now() + 4 * 3600 * 1000).toISOString();
              await fetch(`/api/campaign/${campaignId}/inbox/bulk`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: [threadId], action: "snooze", until }),
              });
            }}
          >
            Snooze 4h
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              await fetch(`/api/campaign/${campaignId}/inbox/bulk`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: [threadId], action: "mark_done" }),
              });
            }}
          >
            Mark done
          </Button>
        </div>
      </div>
    </div>
  );
}


