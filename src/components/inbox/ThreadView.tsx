"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/Input";
import { AlertCircle, CheckCircle, Clock, Send, Sparkles } from "lucide-react";

type Message = {
  id: string;
  direction: "inbound" | "outbound";
  content: string;
  channel: string;
  intent: string | null;
  aiSummary: string | null;
  senderEmail: string | null;
  senderName: string | null;
  subject: string | null;
  createdAt: string;
};

type Task = {
  id: string;
  description: string;
  dueAt: string | null;
  taskType: string | null;
  completed: boolean;
  createdAt: string;
};

type ThreadDetail = {
  thread: {
    id: string;
    leadId: string;
    lead: {
      id: string;
      name: string;
      email: string;
      phone?: string;
      status?: string;
    } | null;
    lastMessage: string;
    summary: string | null;
    intent: string | null;
    urgency: "urgent" | "normal";
    status: string;
    unreadCount: number;
    updatedAt: string;
    createdAt: string;
  };
  messages: Message[];
  tasks: Task[];
};

const INTENT_LABELS: Record<string, string> = {
  booking_request: "Booking Request",
  price_question: "Price Question",
  warranty_claim: "Warranty Claim",
  leak_emergency: "🚨 Leak/Emergency",
  schedule_change: "Schedule Change",
  financing_question: "Financing Question",
  ready_to_move_forward: "Ready to Move Forward",
  send_proposal_again: "Resend Proposal",
  complaint: "Complaint",
  referral: "Referral",
  not_interested: "Not Interested",
  material_question: "Material Question",
  unknown: "Unknown",
};

export default function ThreadView() {
  const params = useParams();
  const router = useRouter();
  const threadId = params.id as string;

  const [threadDetail, setThreadDetail] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [suggestedReply, setSuggestedReply] = useState<string>("");
  const [replyContent, setReplyContent] = useState("");
  const [replySubject, setReplySubject] = useState("");
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (threadId) {
      fetchThreadDetail();
    }
  }, [threadId]);

  const fetchThreadDetail = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/inbox/threads/${threadId}`);
      if (!res.ok) {
        router.push("/dashboard/inbox-command-center");
        return;
      }
      const data = await res.json();
      setThreadDetail(data);
      setReplySubject(data.messages[0]?.subject || "");
    } catch (error) {
      console.error("Error fetching thread:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestReply = async () => {
    setLoadingSuggest(true);
    try {
      const res = await fetch(`/api/inbox/threads/${threadId}/suggest-reply`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.reply) {
        setSuggestedReply(data.reply);
        setReplyContent(data.reply);
      }
    } catch (error) {
      console.error("Error generating suggestion:", error);
    } finally {
      setLoadingSuggest(false);
    }
  };

  const handleSendReply = async () => {
    if (!replyContent.trim()) return;

    setSending(true);
    try {
      const res = await fetch(`/api/inbox/threads/${threadId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: replyContent,
          subject: replySubject,
        }),
      });

      if (res.ok) {
        setReplyContent("");
        setSuggestedReply("");
        fetchThreadDetail(); // Refresh thread
      }
    } catch (error) {
      console.error("Error sending reply:", error);
    } finally {
      setSending(false);
    }
  };

  const handleCreateTask = async (description: string, taskType?: string) => {
    try {
      await fetch("/api/inbox/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: threadId,
          lead_id: threadDetail?.thread.leadId,
          description,
          task_type: taskType,
        }),
      });
      fetchThreadDetail(); // Refresh to show new task
    } catch (error) {
      console.error("Error creating task:", error);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Loading thread...</p>
      </div>
    );
  }

  if (!threadDetail) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Thread not found</p>
      </div>
    );
  }

  const { thread, messages, tasks } = threadDetail;

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="border-b bg-background p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">{thread.lead?.name || thread.lead?.email}</h1>
            <div className="flex items-center gap-2 mt-1">
              {thread.lead?.email && (
                <span className="text-sm text-muted-foreground">{thread.lead.email}</span>
              )}
              {thread.lead?.phone && (
                <span className="text-sm text-muted-foreground">• {thread.lead.phone}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {thread.urgency === "urgent" && (
              <Badge variant="destructive">Urgent</Badge>
            )}
            {thread.intent && (
              <Badge variant="outline">
                {INTENT_LABELS[thread.intent] || thread.intent}
              </Badge>
            )}
            <Button variant="outline" onClick={() => router.back()}>
              Back
            </Button>
          </div>
        </div>

        {/* Thread Summary */}
        {thread.summary && (
          <Card className="p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-blue-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  Thread Summary
                </p>
                <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">
                  {thread.summary}
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Tasks */}
        {tasks.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-medium mb-2">Auto-Generated Tasks</p>
            <div className="space-y-2">
              {tasks.map((task) => (
                <Card key={task.id} className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle
                      className={`h-4 w-4 ${
                        task.completed
                          ? "text-green-600"
                          : "text-muted-foreground"
                      }`}
                    />
                    <span
                      className={`text-sm ${
                        task.completed ? "line-through text-muted-foreground" : ""
                      }`}
                    >
                      {task.description}
                    </span>
                    {task.taskType && (
                      <Badge variant="outline" className="text-xs">
                        {task.taskType}
                      </Badge>
                    )}
                  </div>
                  {task.dueAt && (
                    <span className="text-xs text-muted-foreground">
                      Due: {new Date(task.dueAt).toLocaleDateString()}
                    </span>
                  )}
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.direction === "outbound" ? "justify-end" : "justify-start"
            }`}
          >
            <Card
              className={`max-w-2xl p-4 ${
                message.direction === "outbound"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium">
                  {message.direction === "inbound"
                    ? message.senderName || message.senderEmail || "Homeowner"
                    : "You"}
                </span>
                <span className="text-xs opacity-70">
                  {new Date(message.createdAt).toLocaleString()}
                </span>
                {message.intent && message.direction === "inbound" && (
                  <Badge
                    variant="outline"
                    className={
                      message.direction === "outbound"
                        ? "border-primary-foreground/20 text-primary-foreground"
                        : ""
                    }
                  >
                    {INTENT_LABELS[message.intent] || message.intent}
                  </Badge>
                )}
              </div>
              {message.subject && (
                <p className="text-sm font-medium mb-2">{message.subject}</p>
              )}
              <p
                className={`text-sm whitespace-pre-wrap ${
                  message.direction === "outbound"
                    ? "text-primary-foreground"
                    : ""
                }`}
              >
                {message.content}
              </p>
              {message.aiSummary && message.direction === "inbound" && (
                <div className="mt-2 pt-2 border-t border-current/20">
                  <p className="text-xs opacity-70 italic">{message.aiSummary}</p>
                </div>
              )}
            </Card>
          </div>
        ))}
      </div>

      {/* Reply Composer */}
      <div className="border-t bg-background p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Reply</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSuggestReply}
              disabled={loadingSuggest}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {loadingSuggest ? "Generating..." : "AI Suggest Reply"}
            </Button>
          </div>

          {suggestedReply && (
            <Card className="p-3 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-xs font-medium text-blue-900 dark:text-blue-100 mb-1">
                    AI Suggested Reply
                  </p>
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    {suggestedReply}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    setSuggestedReply("");
                  }}
                >
                  Dismiss
                </Button>
              </div>
            </Card>
          )}

          <Input
            placeholder="Subject (optional)"
            value={replySubject}
            onChange={(e) => setReplySubject(e.target.value)}
          />

          <Textarea
            placeholder="Type your reply..."
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            rows={4}
            className="resize-none"
          />

          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  handleCreateTask(
                    `Follow up with ${thread.lead?.name || "homeowner"}`,
                    "followup"
                  )
                }
              >
                Create Task
              </Button>
              {thread.intent === "booking_request" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleCreateTask(
                      `Schedule appointment for ${thread.lead?.name || "homeowner"}`,
                      "appointment"
                    )
                  }
                >
                  Create Appointment Task
                </Button>
              )}
            </div>
            <Button onClick={handleSendReply} disabled={!replyContent.trim() || sending}>
              <Send className="h-4 w-4 mr-2" />
              {sending ? "Sending..." : "Send Reply"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
































