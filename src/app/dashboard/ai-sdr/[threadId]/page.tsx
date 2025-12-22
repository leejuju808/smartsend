"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@/lib/supabase";
import { draftReply, executeNextBestAction } from "../../../../lib/aiSdr";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/src/components/ui/badge";
import { ArrowLeft, Send, Sparkles, RefreshCw } from "lucide-react";

type ThreadOverview = {
  thread_id: string;
  lead_id: string;
  campaign_id: string;
  status: string;
  lead_email: string;
  lead_name: string;
  campaign_name: string;
  last_message_from: string;
  last_message_at: string;
  summary?: string | null;
  summary_updated_at?: string | null;
  health_score?: number | null;
  health_label?: "hot" | "warm" | "cold" | null;
  next_best_action?: string | null;
  next_best_action_reason?: string | null;
  next_best_action_generated_at?: string | null;
  next_best_action_options?: Array<{ action: string; label: string; score: number }> | null;
  inbox_state?: string | null;
  inbox_state_reason?: string | null;
  inbox_state_updated_at?: string | null;
};

type Objection = {
  id: string;
  objection_type: string;
  confidence: number;
  objection_summary: string | null;
  suggested_reply: string | null;
  tactic_action: string | null;
  tactic_executed_at: string | null;
  tactic_notes: string | null;
  created_at: string;
};

type TimelineItem = {
  item_type: string;
  item_id: string;
  thread_id: string;
  created_at: string;
  direction: string | null;
  subject: string | null;
  content: string | null;
  event_type: string | null;
  details: any;
};

export default function ThreadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const threadId = params.threadId as string;
  const supabase = createClientComponentClient();

  const [thread, setThread] = useState<ThreadOverview | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [objections, setObjections] = useState<Objection[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [refreshingNbm, setRefreshingNbm] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [updatingState, setUpdatingState] = useState(false);
  const [runningTactic, setRunningTactic] = useState(false);

  useEffect(() => {
    loadThread();
  }, [threadId]);

  async function loadThread() {
    try {
      setLoading(true);
      const [{ data: threadData }, { data: timelineData }, { data: objectionsData }] = await Promise.all([
        supabase
          .from("ai_sdr_thread_overview")
          .select("*")
          .eq("thread_id", threadId)
          .single(),
        supabase
          .from("ai_sdr_timeline_items")
          .select("*")
          .eq("thread_id", threadId)
          .order("created_at", { ascending: true }),
        supabase
          .from("ai_sdr_objections")
          .select("*")
          .eq("thread_id", threadId)
          .order("created_at", { ascending: false }),
      ]);

      if (threadData) {
        setThread(threadData as ThreadOverview);
      }
      if (timelineData) {
        setTimeline(timelineData as TimelineItem[]);
      }
      if (objectionsData) {
        setObjections(objectionsData as Objection[]);
      }
    } catch (error) {
      console.error("Error loading thread:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateDraft() {
    try {
      setGenerating(true);
      const draft = await draftReply(threadId);
      setBody(draft.body || "");
      setSubject(draft.subject || thread?.campaign_name || "Quick follow-up");
    } catch (error: any) {
      console.error("Error generating draft:", error);
      alert(error.message || "Failed to generate draft");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSendReply() {
    if (!body.trim()) {
      alert("Please enter a message body");
      return;
    }

    try {
      setSending(true);
      await sendManualReply({
        threadId,
        subject: subject || thread?.campaign_name || "Quick follow-up",
        body,
      });
      
      // Clear form and reload
      setSubject("");
      setBody("");
      await loadThread();
      alert("Reply sent successfully!");
    } catch (error: any) {
      console.error("Error sending reply:", error);
      alert(error.message || "Failed to send reply");
    } finally {
      setSending(false);
    }
  }

  async function handleExecuteAction(action: string, optionLabel?: string) {
    try {
      setExecuting(true);
      await executeNextBestAction(threadId, action, optionLabel);
      await loadThread();
      alert("Action executed successfully!");
    } catch (error: any) {
      console.error("Error executing action:", error);
      alert(error.message || "Failed to execute action");
    } finally {
      setExecuting(false);
    }
  }

  async function handleRefreshNbm() {
    try {
      setRefreshingNbm(true);
      const res = await fetch("/api/ai-sdr/next-best-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: threadId }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Failed to refresh NBM" }));
        throw new Error(error.error || "Failed to refresh NBM");
      }

      // Reload thread to get updated NBM
      await loadThread();
    } catch (error: any) {
      console.error("Error refreshing NBM:", error);
      alert(error.message || "Failed to refresh Next Best Move");
    } finally {
      setRefreshingNbm(false);
    }
  }

  async function updateInboxState(state: string) {
    try {
      setUpdatingState(true);
      const res = await fetch("/api/ai-sdr/update-inbox-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: threadId,
          state,
        }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Failed to update inbox state" }));
        throw new Error(error.error || "Failed to update inbox state");
      }

      // Reload thread to get updated state
      await loadThread();
    } catch (error: any) {
      console.error("Error updating inbox state:", error);
      alert(error.message || "Failed to update inbox state");
    } finally {
      setUpdatingState(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12 text-gray-500">Loading thread...</div>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="p-6">
        <div className="text-center py-12 text-gray-500">Thread not found</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="border-b p-4 flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">{thread.lead_name}</h1>
          <div className="text-sm text-gray-500">
            {thread.lead_email} • {thread.campaign_name}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => updateInboxState("active")}
            disabled={updatingState || thread.inbox_state === "active"}
          >
            Move to Active
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => updateInboxState("archived")}
            disabled={updatingState || thread.inbox_state === "archived"}
          >
            Archive
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => updateInboxState("muted")}
            disabled={updatingState || thread.inbox_state === "muted"}
          >
            Mute
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => updateInboxState("dismissed")}
            disabled={updatingState || thread.inbox_state === "dismissed"}
          >
            Dismiss
          </Button>
        </div>
      </div>

      {/* Objection Banner */}
      {objections.length > 0 && (
        <div className="mt-4 mx-4 border rounded-xl p-3 bg-red-50 dark:bg-red-950/20 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-sm font-semibold text-red-600 dark:text-red-400">
                Objection Detected: {objections[0].objection_type.replace(/_/g, " ")}
                {" · "}{Math.round(objections[0].confidence * 100)}%
              </div>
              {objections[0].objection_summary && (
                <div className="text-sm text-muted-foreground mt-1">
                  {objections[0].objection_summary}
                </div>
              )}
            </div>
            {objections[0].tactic_action && (
              <Badge variant="outline" className="capitalize ml-2">
                Tactic: {objections[0].tactic_action.replace(/_/g, " ")}
              </Badge>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {objections[0].suggested_reply && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setBody(objections[0].suggested_reply || "");
                  setSubject("Re: " + (thread.campaign_name ?? "your note"));
                }}
              >
                Load Suggested Reply
              </Button>
            )}
            <Button
              size="sm"
              onClick={async () => {
                try {
                  setRunningTactic(true);
                  const res = await fetch("/api/ai-sdr/apply-objection-tactic", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      thread_id: threadId,
                      objection_id: objections[0].id,
                    }),
                  });

                  if (!res.ok) {
                    const error = await res.json().catch(() => ({ error: "Failed to run tactic" }));
                    throw new Error(error.error || "Failed to run tactic");
                  }

                  // Reload thread to get updated tactic info
                  await loadThread();
                } catch (error: any) {
                  console.error("Error running tactic:", error);
                  alert(error.message || "Failed to run playbook tactic");
                } finally {
                  setRunningTactic(false);
                }
              }}
              disabled={runningTactic}
            >
              {runningTactic ? "Running..." : "Run Playbook Tactic"}
            </Button>
          </div>
          {objections[0].tactic_notes && (
            <p className="text-[11px] text-muted-foreground">
              {objections[0].tactic_notes}
            </p>
          )}
        </div>
      )}

      {/* Summary Card */}
      <div className="mt-4 mx-4 border rounded-xl p-3 bg-muted/40 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Thread Summary
          </span>
          {thread.health_label && (
            <Badge
              className="capitalize"
              variant={
                thread.health_label === "hot"
                  ? "default"
                  : thread.health_label === "warm"
                  ? "secondary"
                  : "outline"
              }
            >
              {thread.health_label} · {thread.health_score ?? 0}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {thread.summary ?? "No summary generated yet."}
        </p>
        {thread.summary_updated_at && (
          <p className="text-[11px] text-muted-foreground">
            Updated: {new Date(thread.summary_updated_at).toLocaleString()}
          </p>
        )}
      </div>

      {/* Next Best Action Card */}
      {thread.next_best_action && (
        <div className="mt-4 mx-4 border rounded-xl p-4 bg-blue-50 dark:bg-blue-950/20 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">
              Next Best Action
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefreshNbm}
              disabled={refreshingNbm}
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${refreshingNbm ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100 capitalize">
                {thread.next_best_action.replace(/_/g, " ")}
              </p>
              {thread.next_best_action_reason && (
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                  {thread.next_best_action_reason}
                </p>
              )}
            </div>
            <Button
              size="sm"
              className="w-full"
              onClick={() => {
                const primaryOption = thread.next_best_action_options?.[0];
                handleExecuteAction(
                  thread.next_best_action!,
                  primaryOption?.label
                );
              }}
              disabled={executing}
            >
              {executing ? "Executing..." : "Execute Primary Action"}
            </Button>
            {thread.next_best_action_options && thread.next_best_action_options.length > 1 && (
              <div className="space-y-1">
                <p className="text-xs text-blue-700 dark:text-blue-300 font-medium">Other Options:</p>
                {thread.next_best_action_options.slice(1).map((opt: any, idx: number) => (
                  <button
                    key={idx}
                    className="text-xs flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline w-full text-left"
                    onClick={() => handleExecuteAction(opt.action, opt.label)}
                    disabled={executing}
                  >
                    {opt.label} {opt.score !== undefined && `· ${opt.score}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto grid grid-cols-12">
        {/* Timeline */}
        <div className="col-span-8 border-r p-4 overflow-auto">
          <h2 className="text-sm font-semibold mb-4">Timeline</h2>
          <div className="space-y-4">
            {timeline.length === 0 ? (
              <div className="text-sm text-gray-500">No timeline items yet</div>
            ) : (
              timeline.map((item) => (
                <div key={`${item.item_type}-${item.item_id}`} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-600">
                      {item.item_type === "email" && item.direction === "inbound" && "📥 Inbound"}
                      {item.item_type === "email" && item.direction === "outbound" && "📤 Outbound"}
                      {item.item_type === "ai_event" && "🤖 AI Event"}
                      {item.item_type === "meeting" && "📅 Meeting"}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(item.created_at).toLocaleString()}
                    </span>
                  </div>
                  {item.subject && (
                    <div className="text-sm font-medium mb-1">{item.subject}</div>
                  )}
                  {item.content && (
                    <div className="text-sm text-gray-700 whitespace-pre-wrap">
                      {item.content.substring(0, 200)}
                      {item.content.length > 200 && "..."}
                    </div>
                  )}
                  {item.event_type && (
                    <div className="text-xs text-gray-500 mt-1">Event: {item.event_type}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Manual Reply Sidebar */}
        <div className="col-span-4 p-4 flex flex-col">
          <h2 className="text-sm font-semibold mb-4">Manual Reply</h2>
          
          <div className="space-y-4 flex-1">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Subject</label>
              <Input
                placeholder="Subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full"
              />
            </div>

            <div className="flex-1 flex flex-col">
              <label className="text-xs text-gray-600 mb-1 block">Message</label>
              <Textarea
                placeholder="Reply…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="min-h-[200px] flex-1"
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateDraft}
                disabled={generating}
                className="flex-1"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {generating ? "Generating..." : "Ask AI for draft"}
              </Button>

              <Button
                size="sm"
                onClick={handleSendReply}
                disabled={sending || !body.trim()}
                className="flex-1"
              >
                <Send className="h-4 w-4 mr-2" />
                {sending ? "Sending..." : "Send Reply"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

async function sendManualReply({
  threadId,
  subject,
  body,
}: {
  threadId: string;
  subject: string;
  body: string;
}) {
  const res = await fetch("/api/ai-sdr/send-reply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      thread_id: threadId,
      subject,
      body,
    }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Failed to send reply" }));
    throw new Error(error.error || "Failed to send reply");
  }

  return res.json();
}
