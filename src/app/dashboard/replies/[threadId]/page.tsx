"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useThread } from "@/hooks/useThread";
import MessageBubble from "@/components/replies/MessageBubble";
import ReplyBox from "@/components/replies/ReplyBox";
import LeadContext from "@/components/replies/LeadContext";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { NudgeBanner } from "@/components/thread/NudgeBanner";
import { Button } from "@/components/ui/Button";

type FollowupDraft = {
  id: string;
  ai_draft: string;
  scheduled_for: string;
};

export default function ThreadPage() {
  const { threadId } = useParams<{ threadId: string }>();
  const supabase = createClientComponentClient();

  const { messages, loading } = useThread(threadId as string);
  const [meta, setMeta] = useState<{ subject: string | null; lead_email: string; from_email?: string } | null>(null);
  const [followupDraft, setFollowupDraft] = useState<FollowupDraft | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("threads")
        .select("subject, lead_email")
        .eq("id", threadId)
        .single();
      setMeta(data as any);
    })();
  }, [supabase, threadId]);

  // Fetch pending follow-up draft
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("ai_followup_queue")
        .select("id, ai_draft, scheduled_for")
        .eq("thread_id", threadId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setFollowupDraft(data as FollowupDraft | null);
    })();
  }, [supabase, threadId]);

  const lastInbound = useMemo(
    () => [...messages].reverse().find((m) => m.direction === "inbound"),
    [messages]
  );

  // TODO: replace with the user's connected mailbox address
  const fromEmail = "me@smartsendhq.com";
  const toEmail = meta?.lead_email || "";

  const approveDraft = async () => {
    if (!followupDraft) return;
    setSending(true);
    try {
      const res = await fetch("/api/followups/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: followupDraft.id }),
      });
      if (res.ok) {
        setFollowupDraft(null);
        // Refresh messages
        window.location.reload();
      } else {
        const json = await res.json();
        alert(json.error || "Failed to send");
      }
    } catch (error) {
      console.error("Error sending follow-up:", error);
      alert("Failed to send follow-up");
    } finally {
      setSending(false);
    }
  };

  const skipDraft = async () => {
    if (!followupDraft) return;
    try {
      const { error } = await supabase
        .from("ai_followup_queue")
        .update({ status: "skipped" })
        .eq("id", followupDraft.id);
      if (error) {
        console.error("Error skipping draft:", error);
        alert("Failed to skip draft");
      } else {
        setFollowupDraft(null);
      }
    } catch (error) {
      console.error("Error skipping draft:", error);
      alert("Failed to skip draft");
    }
  };

  return (
    <div className="flex h-[calc(100vh-64px)]">
      <div className="flex-1 flex flex-col p-6">
        <div className="pb-3 border-b">
          <h2 className="text-lg font-semibold">{meta?.subject ?? "(no subject)"}</h2>
          <div className="text-sm text-muted-foreground">
            {meta?.lead_email} • {messages.length} message{messages.length !== 1 ? "s" : ""}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {loading && <div>Loading thread…</div>}
          {!loading && messages.map((m) => (
            <MessageBubble
              key={m.id}
              direction={m.direction}
              from={m.from_email}
              time={m.sent_at}
              html={m.body_html || undefined}
              text={m.body_text || undefined}
            />
          ))}
        </div>

        {followupDraft && (
          <div className="border rounded-2xl bg-muted/10 p-3 mt-3 mb-3">
            <h4 className="font-semibold mb-1">🤖 AI Follow-up Draft</h4>
            <p className="text-sm text-muted-foreground whitespace-pre-line mb-2">{followupDraft.ai_draft}</p>
            <div className="flex gap-2">
              <Button onClick={approveDraft} disabled={sending} size="sm">
                {sending ? "Sending..." : "Send"}
              </Button>
              <Button variant="secondary" onClick={skipDraft} size="sm" disabled={sending}>
                Skip
              </Button>
            </div>
          </div>
        )}

        <div className="pt-3 border-t">
          <div className="pb-3">
            <NudgeBanner threadId={threadId as string} />
          </div>
          <ReplyBox
            threadId={threadId as string}
            fromEmail={fromEmail}
            toEmail={toEmail}
            onSent={() => {
              // optimistic actions if you want (already realtime)
            }}
          />
          <div className="flex gap-2 mt-2">
            <ThreadActions threadId={threadId as string} />
          </div>
        </div>
      </div>
      <LeadContext leadEmail={meta?.lead_email} />
    </div>
  );
}

function ThreadActions({ threadId }: { threadId: string }) {
  const supabase = createClientComponentClient();

  const mark = async (status: "open" | "replied" | "archived") => {
    await supabase.from("threads").update({ status }).eq("id", threadId);
  };

  return (
    <>
      <button onClick={() => mark("open")} className="px-3 py-1 rounded-xl border">Mark open</button>
      <button onClick={() => mark("replied")} className="px-3 py-1 rounded-xl border">Mark replied</button>
      <button onClick={() => mark("archived")} className="px-3 py-1 rounded-xl border">Archive</button>
    </>
  );
}
