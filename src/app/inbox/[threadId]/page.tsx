"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { ThreadHeaderBadges } from "./ThreadHeaderBadges";
import { BounceBanner } from "./BounceBanner";
import type { ThreadLabel } from "../components/LabelBadge";

type Thread = {
  id: string;
  campaignId: string | null;
  leadId: string | null;
  subject: string | null;
  snoozedUntil: string | null;
  label: ThreadLabel;
  hasActiveOOO: boolean;
  resumeAfter: string | null;
  labeledAt: string | null;
  confidence: number | null;
  oooPreview: string | null;
};
type Lead = { email: string | null; first_name: string | null; last_name: string | null; company: string | null };
type InboxMessage = {
  id: string;
  direction: string | null;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  from_email: string | null;
  to_email: string | null;
  created_at: string;
};

function ReplyComposer({ thread, onSent }: { thread: Thread; onSent?: () => void }) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("<p>Thanks for getting back to me, {{first_name}}.</p>");
  const [sending, setSending] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [snippets, setSnippets] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { data: L } = await supabase
        .from("leads")
        .select("email,first_name,last_name,company")
        .eq("id", thread.leadId)
        .maybeSingle();
      setLead(L || null);

      const { data: tmpls } = await supabase
        .from("inbox_templates")
        .select("id,name,subject_template,body_html_template")
        .order("created_at", { ascending: false });
      setTemplates(tmpls || []);

      const { data: snips } = await supabase
        .from("inbox_snippets")
        .select("id,name,content_html")
        .order("name");
      setSnippets(snips || []);

      const { data: last } = await supabase
        .from("inbox_messages")
        .select("subject")
        .eq("thread_id", thread.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setSubject(
        last?.subject?.replace(/^Re:\s*/i, "Re:") ||
          thread.subject?.replace(/^Re:\s*/i, "Re:") ||
          "Re: "
      );
    })();
  }, [thread.id, thread.leadId, thread.subject]);

  const vars = useMemo(
    () => ({
      email: lead?.email ?? "",
      first_name: lead?.first_name ?? "",
      last_name: lead?.last_name ?? "",
      company: lead?.company ?? "",
    }),
    [lead]
  );

  function insertSnippet(html: string) {
    setBodyHtml((prev) => prev + (prev.trim().endsWith("</p>") ? "" : "<br/>") + html);
  }

  async function insertVariantB() {
    if (!thread.campaignId) {
      alert("No Variant B found for this campaign.");
      return;
    }
    const { data: v } = await supabase
      .from("campaign_step_variants")
      .select("name,subject_template,body_html_template")
      .eq("campaign_id", thread.campaignId)
      .eq("name", "B")
      .limit(1);
    const tpl = (v && v[0]) || null;
    if (!tpl) {
      alert("No Variant B found for this campaign.");
      return;
    }
    setSubject((s) => s || tpl.subject_template || "Re: ");
    setBodyHtml((b) => (b ? `${b}<br/><br/>` : "") + (tpl.body_html_template || ""));
  }

  async function sendReply() {
    setSending(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess?.session?.user?.id;
      if (!uid) throw new Error("No active session");

      const fnUrl = process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL;
      if (!fnUrl) throw new Error("Functions URL not configured");

      const res = await fetch(`${fnUrl}/reply-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: uid,
          thread_id: thread.id,
          subject,
          body_html: bodyHtml,
          variables: vars,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        throw new Error(j.error || "Send failed");
      }
      setBodyHtml("<p></p>");
      onSent?.();
      alert("Reply sent.");
    } catch (e) {
      alert(String(e instanceof Error ? e.message : e));
    } finally {
      setSending(false);
    }
  }

  function applyTemplate(t: any) {
    let s = t.subject_template || subject;
    let b = t.body_html_template || bodyHtml;
    Object.entries(vars).forEach(([k, v]) => {
      s = s.replaceAll(`{{${k}}}`, String(v || ""));
      b = b.replaceAll(`{{${k}}}`, String(v || ""));
    });
    setSubject(s);
    setBodyHtml(b);
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Reply</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="text-xs mb-1">Subject</div>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>

        <div>
          <div className="text-xs mb-1">Body (HTML allowed)</div>
          <Textarea className="h-40" value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} />
          <div className="text-[11px] text-muted-foreground mt-1">
            Use {{`{{first_name}}`}}, {{`{{company}}`}} etc.
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={sendReply} disabled={sending}>
            {sending ? "Sending…" : "Send"}
          </Button>
          <Button size="sm" variant="secondary" onClick={insertVariantB}>
            Insert Variant B
          </Button>

          <div className="flex items-center gap-2">
            <select
              className="border rounded px-2 py-1 text-sm"
              onChange={(e) => {
                const id = e.target.value;
                if (!id) return;
                const t = templates.find((x) => x.id === id);
                if (t) applyTemplate(t);
                e.target.value = "";
              }}
            >
              <option value="">Templates…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              className="border rounded px-2 py-1 text-sm"
              onChange={(e) => {
                const id = e.target.value;
                if (!id) return;
                const s = snippets.find((x) => x.id === id);
                if (s) insertSnippet(s.content_html);
                e.target.value = "";
              }}
            >
              <option value="">Snippets…</option>
              {snippets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ThreadPage() {
  const { threadId } = useParams();
  const [thread, setThread] = useState<Thread | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const latestInboundMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const dir = (messages[i].direction || "").toLowerCase();
      if (dir.startsWith("in")) return messages[i].id;
    }
    return null;
  }, [messages]);

  useEffect(() => {
    async function load() {
      if (!threadId || typeof threadId !== "string") {
        setError("Missing thread id");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const { data: threadRow, error: threadErr } = await supabase
        .from("inbox_threads")
        .select(
          `
            id,
            subject,
            campaign_id,
            lead_id,
            snoozed_until,
            v_inbox_labels(label, confidence, labeled_at),
            out_of_office_logs(resume_after, active)
          `
        )
        .eq("id", threadId)
        .maybeSingle();

      if (threadErr) {
        setError(threadErr.message);
        setLoading(false);
        return;
      }
      if (!threadRow) {
        setError("Thread not found");
        setLoading(false);
        return;
      }

      const labelRow = Array.isArray(threadRow.v_inbox_labels)
        ? threadRow.v_inbox_labels[0] ?? null
        : threadRow.v_inbox_labels ?? null;
      const oooLogs = Array.isArray(threadRow.out_of_office_logs)
        ? threadRow.out_of_office_logs
        : threadRow.out_of_office_logs
        ? [threadRow.out_of_office_logs]
        : [];
      const latestOOO =
        oooLogs
          .slice()
          .sort(
            (a: any, b: any) =>
              new Date(b?.resume_after ?? 0).getTime() -
              new Date(a?.resume_after ?? 0).getTime()
          )[0] ?? null;

      const { data: previewEvent } = await supabase
        .from("delivery_events")
        .select("meta")
        .eq("thread_id", threadRow.id)
        .in("event", ["ooo_detected", "reply_detected"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const previewMeta = (previewEvent?.meta ?? {}) as any;
      const oooPreview =
        typeof previewMeta?.clean_preview === "string" && previewMeta.clean_preview.trim().length
          ? previewMeta.clean_preview.trim()
          : typeof previewMeta?.preview === "string" && previewMeta.preview.trim().length
          ? previewMeta.preview.trim()
          : null;

      setThread({
        id: threadRow.id,
        campaignId: threadRow.campaign_id,
        leadId: threadRow.lead_id,
        subject: threadRow.subject,
        snoozedUntil: threadRow.snoozed_until,
        label: labelRow?.label ?? null,
        hasActiveOOO: Boolean(latestOOO?.active),
        resumeAfter: latestOOO?.resume_after ?? null,
        labeledAt: labelRow?.labeled_at ?? null,
        confidence: labelRow?.confidence ?? null,
        oooPreview,
      });

      if (threadRow.lead_id) {
        const { data: leadRow } = await supabase
          .from("leads")
          .select("email,first_name,last_name,company")
          .eq("id", threadRow.lead_id)
          .maybeSingle();
        setLead(leadRow || null);
      } else {
        setLead(null);
      }

      const { data: messageRows, error: msgErr } = await supabase
        .from("inbox_messages")
        .select("id,direction,subject,body_html,body_text,from_email,to_email,created_at")
        .eq("thread_id", threadRow.id)
        .order("created_at", { ascending: true });

      if (msgErr) {
        setError(msgErr.message);
        setMessages([]);
      } else {
        setMessages(messageRows || []);
      }

      setLoading(false);
    }

    load();
  }, [threadId]);

  const subject = messages[messages.length - 1]?.subject || "(no subject)";

  async function refreshMessages() {
    if (!thread) return;
    const { data: messageRows, error: msgErr } = await supabase
      .from("inbox_messages")
      .select("id,direction,subject,body_html,body_text,from_email,to_email,created_at")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: true });
    if (!msgErr) {
      setMessages(messageRows || []);
    }
  }

  if (loading) {
    return <div className="p-6">Loading thread…</div>;
  }

  if (error || !thread) {
    return <div className="p-6 text-red-600">{error || "Unable to load thread"}</div>;
  }

  const subjectLine = thread.subject ?? subject;
  const labeledMeta =
    thread.labeledAt || typeof thread.confidence === "number"
      ? [
          thread.labeledAt ? `Labeled ${new Date(thread.labeledAt).toLocaleString()}` : null,
          typeof thread.confidence === "number"
            ? `conf ${thread.confidence.toFixed(2)}`
            : null,
        ]
          .filter(Boolean)
          .join(" • ")
      : null;

  return (
    <div className="p-6 space-y-4">
      <div className="border-b pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">{subjectLine}</h1>
            {lead && (
              <div className="space-y-1 text-sm text-muted-foreground">
                <div>
                  <span className="font-medium">Lead:</span>{" "}
                  {lead.email || lead.first_name || "Unknown"}
                </div>
                {lead.company && (
                  <div>
                    <span className="font-medium">Company:</span> {lead.company}
                  </div>
                )}
              </div>
            )}
            {labeledMeta && (
              <div className="text-xs text-muted-foreground">{labeledMeta}</div>
            )}
          </div>
          <ThreadHeaderBadges
            label={thread.label}
            snoozedUntil={thread.snoozedUntil}
            hasActiveOOO={thread.hasActiveOOO}
            resumeAfter={thread.resumeAfter}
            oooPreview={thread.oooPreview}
          />
        </div>
      </div>

      {latestInboundMessageId && <BounceBanner messageId={latestInboundMessageId} />}

      <div className="space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`p-4 rounded-2xl border ${
              msg.direction === "in" || msg.direction === "inbound" ? "bg-gray-100" : "bg-yellow-50"
            }`}
          >
            <div className="text-xs text-muted-foreground flex justify-between">
              <span>{msg.from_email || (msg.direction === "out" ? "You" : "")}</span>
              <span>{new Date(msg.created_at).toLocaleString()}</span>
            </div>
            {msg.body_html ? (
              <div className="mt-2 prose max-w-none" dangerouslySetInnerHTML={{ __html: msg.body_html }} />
            ) : (
              <p className="mt-2 whitespace-pre-wrap">{msg.body_text || ""}</p>
            )}
          </div>
        ))}
      </div>

      <ReplyComposer thread={thread} onSent={refreshMessages} />
    </div>
  );
}

