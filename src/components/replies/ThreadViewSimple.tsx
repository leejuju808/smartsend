"use client";
import { useEffect, useState } from "react";
import { runReplyDetection } from "@/lib/hooks/useReplyDetection";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/toast/ToastProvider";

export default function ThreadViewSimple({
  userId, threadId, leadId, onDetectionComplete
}: { 
  userId: string; 
  threadId: string | null; 
  leadId?: string | null;
  onDetectionComplete?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [msgs, setMsgs] = useState<any[]>([]);
  const [detecting, setDetecting] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    const run = async () => {
      if (!threadId) return;
      setLoading(true);
      try {
        // load cache first
        const cached = await fetch(`/api/replies/thread-cache?user=${encodeURIComponent(userId)}&thread=${encodeURIComponent(threadId)}`).then(r=>r.json()).catch(()=>({items:[]}));
        setMsgs(cached.items ?? []);

        // then fetch fresh from Gmail (and cache)
        const fresh = await fetch("/api/gmail/thread", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, threadId })
        }).then(r=>r.json());
        if (fresh?.messages) setMsgs(fresh.messages.sort((a:any,b:any)=>new Date(a.internal_ts).getTime()-new Date(b.internal_ts).getTime()));
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [threadId, userId]);

  const onDetect = async () => {
    if (!leadId) {
      addToast({ title: "No lead ID", description: "Unable to detect reply without lead information", variant: "error" });
      return;
    }

    // Get the latest inbound message body
    const latestInbound = msgs
      .filter((m: any) => m.body_text && m.from_email.toLowerCase() !== userId.toLowerCase())
      .sort((a: any, b: any) => new Date(b.internal_ts).getTime() - new Date(a.internal_ts).getTime())[0];

    if (!latestInbound?.body_text) {
      addToast({ title: "No message", description: "No inbound message found to analyze", variant: "error" });
      return;
    }

    try {
      setDetecting(true);
      const { isReply } = await runReplyDetection(latestInbound.body_text, leadId);
      addToast({
        title: isReply ? "Marked as replied ✅" : "Not a human reply",
        description: isReply ? "The lead has been marked as replied" : "The message was not detected as a genuine reply",
        variant: isReply ? "success" : "info",
      });
      // Trigger refresh of replies/leads data
      if (onDetectionComplete) {
        onDetectionComplete();
      }
    } catch (e: any) {
      addToast({ title: "Detection failed", description: e.message || "Unknown error", variant: "error" });
    } finally {
      setDetecting(false);
    }
  };

  if (!threadId) return <div className="flex-1 flex items-center justify-center text-sm opacity-70">Select a thread</div>;

  return (
    <div className="flex-1 flex flex-col">
      {leadId && (
        <div className="px-4 py-2 border-b border-neutral-800 flex items-center gap-2">
          <Button 
            onClick={onDetect} 
            disabled={detecting || !leadId || loading} 
            size="sm" 
            className="rounded-2xl"
          >
            {detecting ? "Detecting..." : "Detect Reply"}
          </Button>
        </div>
      )}
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {msgs.map((m) => (
          <div key={m.gmail_message_id} className="rounded-xl border border-neutral-800 p-3">
            <div className="text-sm opacity-80">
              <span className="font-semibold">{m.from_email}</span>
              <span className="opacity-60"> → {m.to_email ?? "me"}</span>
              <span className="opacity-60"> · {new Date(m.internal_ts).toLocaleString()}</span>
            </div>
            <div className="mt-2 whitespace-pre-wrap">{m.body_text ?? "(no text body)"}</div>
          </div>
        ))}
        {loading && <p className="text-xs opacity-60">Loading…</p>}
      </div>
    </div>
  );
}

