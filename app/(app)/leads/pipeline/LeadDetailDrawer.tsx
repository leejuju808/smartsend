"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export type LeadForDrawer = {
  contact_id: string;
  display_name: string | null;
  email: string | null;
  company: string | null;
  latest_intent: string | null;
  latest_intent_confidence: number | null;
  last_intent_at: string | null;
  effective_stage: string | null;
  smartsend_homeowner?: boolean;
};

type CallNotes = {
  address: string | null;
  issueType: string | null;
  urgency: string | null;
  generatedAt: string | null;
} | null;

type Props = {
  lead: LeadForDrawer | null;
  open: boolean;
  onClose: () => void;
};

const QUICK_TEMPLATES: {
  label: string;
  build: (lead: LeadForDrawer) => { subject: string; body: string };
}[] = [
  {
    label: "Book Inspection (Roofing)",
    build: (lead) => ({
      subject: "Quick roof inspection this week?",
      body:
        `Hi ${lead.display_name || ""},\n\n` +
        `Thanks for your interest. We can send a roofing specialist to take a look at your home and give you a clear estimate.\n\n` +
        `What day and time works best for you this week?\n\n` +
        `- Morning (8–11am)\n` +
        `- Midday (11am–2pm)\n` +
        `- Afternoon (2–5pm)\n\n` +
        `Reply with your address and a time window, and we'll lock it in.\n\n` +
        `Best,\n` +
        `Your Roofing Team`,
    }),
  },
  {
    label: "Estimate Follow-Up",
    build: (lead) => ({
      subject: "Quick follow-up on your roofing estimate",
      body:
        `Hi ${lead.display_name || ""},\n\n` +
        `Just checking in on the roofing estimate we sent over. Do you have any questions or anything you'd like us to adjust?\n\n` +
        `If you're ready to move forward, reply "GO" and we'll schedule your project.\n\n` +
        `Best,\n` +
        `Your Roofing Team`,
    }),
  },
];

export function LeadDetailDrawer({ lead, open, onClose }: Props) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [callNotes, setCallNotes] = useState<CallNotes>(null);
  const [loadingNotes, setLoadingNotes] = useState(false);

  if (!lead) return null;

  // Block 268300: Show auto-generated call notes inline under the lead
  useEffect(() => {
    if (!open || !lead?.contact_id) return;

    const load = async () => {
      setLoadingNotes(true);
      try {
        const supabase = createClientComponentClient();
        const { data, error } = await supabase
          .from("inbox_threads")
          .select("call_notes_address, call_notes_issue_type, call_notes_urgency, call_notes_generated_at, last_message_at")
          .eq("contact_id", lead.contact_id)
          .order("call_notes_generated_at", { ascending: false })
          .order("last_message_at", { ascending: false })
          .limit(1);

        if (error || !data || data.length === 0) {
          setCallNotes(null);
          return;
        }

        const row: any = data[0];
        const hasAny = Boolean(
          row.call_notes_address || row.call_notes_issue_type || row.call_notes_urgency
        );
        if (!hasAny) {
          setCallNotes(null);
          return;
        }

        setCallNotes({
          address: row.call_notes_address || null,
          issueType: row.call_notes_issue_type || null,
          urgency: row.call_notes_urgency || null,
          generatedAt: row.call_notes_generated_at || null,
        });
      } catch {
        setCallNotes(null);
      } finally {
        setLoadingNotes(false);
      }
    };

    load();
  }, [open, lead?.contact_id]);

  const applyTemplate = (
    builder: (lead: LeadForDrawer) => { subject: string; body: string }
  ) => {
    const { subject, body } = builder(lead);
    setSubject(subject);
    setBody(body);
    setStatusMsg(null);
  };

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) return;
    setSending(true);
    setStatusMsg(null);

    try {
      const res = await fetch("/api/leads/send-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: lead.contact_id,
          subject,
          body,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setStatusMsg(data.error || "Failed to send reply.");
      } else {
        setStatusMsg("Reply queued to send ✅");
        // Clear form after successful send
        setTimeout(() => {
          setSubject("");
          setBody("");
          setStatusMsg(null);
        }, 2000);
      }
    } catch (err) {
      setStatusMsg("Failed to send reply.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className={clsx(
        "fixed inset-0 z-40 transition",
        open ? "pointer-events-auto" : "pointer-events-none"
      )}
    >
      {/* Backdrop */}
      <div
        className={clsx(
          "absolute inset-0 bg-black/60 transition-opacity",
          open ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={clsx(
          "absolute inset-y-0 right-0 w-full max-w-md bg-zinc-950 border-l border-zinc-800 shadow-xl transform transition-transform",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div>
            <p className="text-sm font-semibold">
              {lead.display_name || lead.email || "Lead Details"}
            </p>
            {lead.email && (
              <p className="text-xs text-zinc-500">{lead.email}</p>
            )}
            {lead.smartsend_homeowner ? (
              <p className="mt-1">
                <span className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-900/60 px-2 py-0.5 text-[10px] text-zinc-200">
                  SmartSend Homeowner
                </span>
              </p>
            ) : null}
          </div>
          <button
            onClick={onClose}
            className="text-xs text-zinc-400 hover:text-zinc-100"
          >
            Close
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto max-h-full pb-24">
          {/* Info */}
          <div className="space-y-1 text-xs text-zinc-400">
            {lead.company && (
              <p>
                <span className="text-zinc-500">Company:</span> {lead.company}
              </p>
            )}
            {lead.effective_stage && (
              <p>
                <span className="text-zinc-500">Stage:</span>{" "}
                {lead.effective_stage}
              </p>
            )}
            {lead.latest_intent && (
              <p>
                <span className="text-zinc-500">AI Intent:</span>{" "}
                <span className="font-semibold text-zinc-200">
                  {lead.latest_intent}
                </span>{" "}
                {lead.latest_intent_confidence != null && (
                  <span>
                    ({Math.round(Number(lead.latest_intent_confidence) * 100)}%)
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Call notes */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-3">
            <p className="text-xs font-semibold text-zinc-300">Call notes</p>
            {loadingNotes ? (
              <p className="mt-1 text-[11px] text-zinc-500">Loading…</p>
            ) : callNotes ? (
              <div className="mt-1 space-y-1 text-[11px] text-zinc-400">
                {callNotes.address ? (
                  <p>
                    <span className="text-zinc-500">Address:</span> {callNotes.address}
                  </p>
                ) : null}
                {callNotes.issueType ? (
                  <p>
                    <span className="text-zinc-500">Issue:</span>{" "}
                    {callNotes.issueType.replace(/_/g, " ")}
                  </p>
                ) : null}
                {callNotes.urgency ? (
                  <p>
                    <span className="text-zinc-500">Urgency:</span> {callNotes.urgency}
                  </p>
                ) : null}
                {!callNotes.address && !callNotes.issueType && !callNotes.urgency ? (
                  <p className="text-zinc-500">—</p>
                ) : null}
              </div>
            ) : (
              <p className="mt-1 text-[11px] text-zinc-500">
                No call notes yet.
              </p>
            )}
          </div>

          {/* Quick templates */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-zinc-300">
              Quick Reply Templates
            </p>
            <div className="flex flex-wrap gap-2">
              {QUICK_TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  onClick={() => applyTemplate(t.build)}
                  className="text-[11px] rounded-full border border-zinc-700 px-2 py-1 text-zinc-300 hover:border-zinc-400"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Composer */}
          <div className="space-y-2">
            <label className="block text-xs text-zinc-400">
              Subject
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </label>

            <label className="block text-xs text-zinc-400">
              Message
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
              />
            </label>

            <button
              onClick={handleSend}
              disabled={sending || !subject.trim() || !body.trim()}
              className={clsx(
                "mt-1 w-full rounded-xl px-3 py-2 text-xs font-semibold",
                sending || !subject.trim() || !body.trim()
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                  : "bg-emerald-500 text-black hover:bg-emerald-400"
              )}
            >
              {sending ? "Sending…" : "Send Reply"}
            </button>

            {statusMsg && (
              <p className="mt-1 text-[11px] text-zinc-400">{statusMsg}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}






























































