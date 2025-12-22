"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { SharedCampaignInfo } from "@/components/campaigns/shared-campaign-info";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { VariablesSidebar } from "../VariablesSidebar";
import { ABLauncher } from "../ABLauncher";
import { AIReplyCopilot } from "@/components/ai/AIReplyCopilot";
import { GenerateEstimateButton } from "@/components/inbox/GenerateEstimateButton";
import { EstimateDisplay } from "@/components/inbox/EstimateDisplay";
import { ProposalDisplay } from "@/components/inbox/ProposalDisplay";

type Message = {
  id: string;
  direction: "inbound" | "outbound";
  created_at: string;
  body_text: string | null;
  subject: string | null;
};

type Note = {
  id: string;
  created_at: string;
  body: string;
};

type OwnerOption = {
  id: string;
  email: string;
};

type LeadInfo = {
  id: string;
  email: string | null;
};

type OooRoute = {
  thread_id: string;
  campaign_id: string;
  lead_id: string;
  status: string;
  parsed_return_at: string | null;
  followup_due_at: string | null;
};

export default function ThreadViewPage() {
  const params = useParams<{ id: string; thread_id: string }>();
  const campaignId = params.id;
  const threadId = params.thread_id;
  const sb = useMemo(supabaseBrowser, []);

  const [messages, setMessages] = useState<Message[]>([]);
  const [lead, setLead] = useState<LeadInfo | null>(null);
  const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);

  const [subject, setSubject] = useState("");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const [note, setNote] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [savedReplies, setSavedReplies] = useState<Array<{ id: string; title: string }>>([]);
  const [savedReplyId, setSavedReplyId] = useState("");
  const [ooo, setOoo] = useState<OooRoute | null>(null);
  const [estimate, setEstimate] = useState<any>(null);
  const [hasEstimate, setHasEstimate] = useState(false);

  async function refreshOoo() {
    const { data } = await sb
      .from("ooo_routes")
      .select(
        "thread_id, campaign_id, lead_id, status, parsed_return_at, followup_due_at"
      )
      .eq("thread_id", threadId)
      .maybeSingle();
    setOoo((data as OooRoute | null) ?? null);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: msgs } = await sb
        .from("inbox_messages")
        .select("id, direction, created_at, body_text, subject")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });
      if (!cancelled) {
        setMessages((msgs as Message[]) || []);
      }

      const { data: thread } = await sb
        .from("inbox_threads")
        .select("lead_id")
        .eq("id", threadId)
        .maybeSingle();
      if (!cancelled && thread?.lead_id) {
        const { data: leadRow } = await sb
          .from("leads")
          .select("email")
          .eq("id", thread.lead_id)
          .maybeSingle();
        setLead({
          id: thread.lead_id,
          email: (leadRow as { email: string | null } | null)?.email ?? null,
        });
      }

      const { data: own } = await sb
        .from("v_thread_owner")
        .select("*")
        .eq("thread_id", threadId)
        .maybeSingle();
      if (!cancelled) {
        setOwnerId((own as { owner_user_id: string } | null)?.owner_user_id ?? null);
      }

      const { data: members } = await sb
        .from("campaign_members")
        .select("user_id, users:auth.users(id,email)")
        .eq("campaign_id", campaignId);
      if (!cancelled) {
        const opts =
          (members as Array<{ users: { id: string; email: string } | null }> | null)?.flatMap(
            (m) => (m.users ? [{ id: m.users.id, email: m.users.email }] : [])
          ) ?? [];
        setOwnerOptions(opts);
      }

      const { data: ns } = await sb
        .from("thread_notes")
        .select("id, created_at, body")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });
      if (!cancelled) {
        setNotes((ns as Note[]) || []);
      }

      const { data: saved } = await sb
        .from("saved_replies")
        .select("id, title")
        .order("created_at", { ascending: false });
      if (!cancelled) {
        setSavedReplies((saved as Array<{ id: string; title: string }> | null) ?? []);
      }

      const { data: oooRow } = await sb
        .from("ooo_routes")
        .select(
          "thread_id, campaign_id, lead_id, status, parsed_return_at, followup_due_at"
        )
        .eq("thread_id", threadId)
        .maybeSingle();
      if (!cancelled) {
        setOoo((oooRow as OooRoute | null) ?? null);
      }

      // Check for existing estimate
      try {
        const estimateResponse = await fetch(
          `/api/inbox/estimates?threadId=${threadId}`
        );
        if (!cancelled && estimateResponse.ok) {
          const estimateData = await estimateResponse.json();
          if (estimateData?.estimate) {
            setEstimate(estimateData.estimate);
            setHasEstimate(true);
          }
        }
      } catch (error) {
        console.error("Error loading estimate:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  async function refreshMessages() {
    const { data: msgs } = await sb
      .from("inbox_messages")
      .select("id, direction, created_at, body_text, subject")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    setMessages((msgs as Message[]) || []);
  }

  async function refreshNotes() {
    const { data: ns } = await sb
      .from("thread_notes")
      .select("id, created_at, body")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    setNotes((ns as Note[]) || []);
  }

  async function sendQuickReply() {
    if (!reply.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/functions/v1/reply-send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          thread_id: threadId,
          body_text: reply,
          subject: subject || null,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        alert(text || "Failed to send reply");
        return;
      }
      setReply("");
      await refreshMessages();
    } finally {
      setSending(false);
    }
  }

  async function assignOwner(uid: string) {
    if (uid === ownerId || (uid === "unassigned" && ownerId === null)) {
      return;
    }

    if (uid === "unassigned") {
      const { error } = await sb.from("thread_assignments").delete().eq("thread_id", threadId);
      if (error) {
        alert(error.message);
        return;
      }
      setOwnerId(null);
      return;
    }

    const { error } = await sb.rpc("assign_thread_owner", {
      p_thread: threadId,
      p_user: uid,
    });
    if (error) {
      alert(error.message);
    } else {
      setOwnerId(uid);
    }
  }

  async function addNote() {
    if (!note.trim()) return;
    const { error } = await sb.rpc("add_thread_note", { p_thread: threadId, p_body: note });
    if (error) {
      alert(error.message);
      return;
    }
    setNote("");
    await refreshNotes();
  }

  async function cancelOoo() {
    const { error } = await sb
      .from("ooo_routes")
      .update({ status: "canceled" })
      .eq("thread_id", threadId);
    if (error) {
      alert(error.message);
      return;
    }
    await refreshOoo();
  }

  async function resumeOoo() {
    let leadId = lead?.id;
    if (!leadId) {
      const { data: thread } = await sb
        .from("inbox_threads")
        .select("lead_id")
        .eq("id", threadId)
        .maybeSingle();
      if (!thread?.lead_id) {
        alert("Lead not found for this thread.");
        return;
      }
      leadId = thread.lead_id;
      setLead((prev) => ({
        id: thread.lead_id,
        email: prev?.email ?? null,
      }));
    }

    const { error } = await sb.from("ooo_routes").upsert({
      thread_id: threadId,
      campaign_id: campaignId,
      lead_id: leadId,
      followup_due_at: new Date().toISOString(),
      status: "pending",
    });
    if (error) {
      alert(error.message);
      return;
    }
    await refreshOoo();
  }

  const ownerSelectValue = ownerId ?? "unassigned";

  return (
    <div className="p-4 grid grid-cols-12 gap-4">
      <div className="col-span-12 lg:col-span-8">
        <div className="rounded-2xl border p-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div>
                <div className="text-sm text-muted-foreground">{lead?.email ?? "—"}</div>
                <SharedCampaignInfo campaignId={campaignId} />
              </div>
              {ooo && (
                <div className="ml-1 text-[11px] px-2 py-1 rounded-full bg-amber-500/15 text-amber-700">
                  OOO — {ooo.status}
                  {ooo.followup_due_at ? (
                    <span className="ml-1">
                      • resumes {new Date(ooo.followup_due_at).toLocaleString()}
                    </span>
                  ) : null}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Owner</span>
              <Select value={ownerSelectValue} onValueChange={assignOwner}>
                <SelectTrigger className="h-8 w-56">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {ownerOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3 max-h-[60vh] overflow-auto pr-2">
            {messages.map((m) => (
              <div key={m.id} className={m.direction === "inbound" ? "text-left" : "text-right"}>
                <div
                  className={`inline-block rounded-2xl px-3 py-2 text-sm ${
                    m.direction === "inbound"
                      ? "bg-muted"
                      : "bg-primary text-primary-foreground"
                  }`}
                >
                  {m.subject ? <div className="font-medium mb-1">{m.subject}</div> : null}
                  <div className="whitespace-pre-wrap">{m.body_text || "—"}</div>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {new Date(m.created_at).toLocaleString()}
                </div>
              </div>
            ))}
            {messages.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-6">No messages yet.</div>
            )}
          </div>

          {/* AI Estimate Builder Section */}
          <div className="mt-4 border-t pt-4">
            {!hasEstimate ? (
              <GenerateEstimateButton
                threadId={threadId}
                onEstimateGenerated={(newEstimate) => {
                  setEstimate(newEstimate);
                  setHasEstimate(true);
                }}
              />
            ) : (
              <EstimateDisplay
                threadId={threadId}
                estimate={estimate}
                onEstimateUpdated={async () => {
                  const { data: estimateData } = await fetch(
                    `/api/inbox/estimates?threadId=${threadId}`
                  ).then((r) => r.json());
                  if (estimateData?.estimate) {
                    setEstimate(estimateData.estimate);
                  }
                }}
              />
            )}
          </div>

          {/* Block 20520: Proposal Builder Section */}
          {hasEstimate && (
            <div className="mt-4 border-t pt-4">
              <ProposalDisplay
                threadId={threadId}
                onProposalGenerated={(proposal) => {
                  // Proposal generated successfully
                  console.log("Proposal generated:", proposal);
                }}
              />
            </div>
          )}

          <div className="mt-4 border-t pt-3 space-y-2">
            <div className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-12 lg:col-span-6">
                <div className="text-xs mb-1">Saved Reply</div>
                <Select value={savedReplyId} onValueChange={setSavedReplyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a saved reply..." />
                  </SelectTrigger>
                  <SelectContent>
                    {savedReplies.map((sr) => (
                      <SelectItem key={sr.id} value={sr.id}>
                        {sr.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-12 lg:col-span-6 flex gap-2">
                <Button
                  variant="outline"
                  disabled={!savedReplyId}
                  onClick={async () => {
                    const res = await fetch("/functions/v1/saved-reply-render", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ thread_id: threadId, saved_reply_id: savedReplyId }),
                    });
                    if (res.ok) {
                      const rendered = await res.json();
                      if (rendered?.subject) setSubject(rendered.subject);
                      if (rendered?.body_text) {
                        setReply((prev) =>
                          prev ? `${prev}\n\n${rendered.body_text}` : rendered.body_text
                        );
                      }
                    } else {
                      alert(await res.text());
                    }
                  }}
                >
                  Insert
                </Button>
                <Button variant="ghost" onClick={() => setSavedReplyId("")}>
                  Clear
                </Button>
              </div>
            </div>
            <Input
              placeholder="Subject (optional)"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <Textarea
              placeholder="Write a quick reply…"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={4}
            />
            <div className="flex justify-end">
              <Button onClick={sendQuickReply} disabled={sending || !reply.trim()}>
                {sending ? "Sending…" : "Send Reply"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="col-span-12 lg:col-span-4 flex flex-col gap-3">
        <VariablesSidebar
          threadId={threadId}
          subject={subject}
          setSubject={setSubject}
          html={reply}
          setHtml={setReply}
        />
        <ABLauncher campaignId={campaignId} threadId={threadId} />
        <div className="rounded-2xl border p-3">
          <h3 className="text-sm font-medium mb-2">Notes</h3>
          <div className="space-y-2 max-h-[40vh] overflow-auto">
            {notes.map((n) => (
              <div key={n.id} className="text-sm">
                <div className="text-[11px] text-muted-foreground">
                  {new Date(n.created_at).toLocaleString()}
                </div>
                <div className="whitespace-pre-wrap">{n.body}</div>
                <div className="h-px bg-border my-2" />
              </div>
            ))}
            {notes.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-4">
                No notes yet.
              </div>
            )}
          </div>
          <Textarea
            rows={3}
            placeholder="Add an internal note…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="mt-2 flex justify-end">
            <Button size="sm" onClick={addNote} disabled={!note.trim()}>
              Add Note
            </Button>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={cancelOoo} disabled={!ooo}>
              Cancel OOO
            </Button>
            <Button
              size="sm"
              onClick={resumeOoo}
              disabled={!lead?.id}
            >
              Resume Now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

