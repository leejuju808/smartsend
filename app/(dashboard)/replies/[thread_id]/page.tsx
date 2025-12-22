"use client";

import { useState } from "react";
import useSWR from "swr";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { IntentBadge } from "@/components/replies/intent-badge";
import { LeadSidebar } from "@/components/leads/sidebar";
import { ThreadTasks } from "@/components/replies/thread-tasks";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function ThreadPage({ params }: { params: { thread_id: string } }) {
  const [replyText, setReplyText] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  const { data, error, mutate } = useSWR(
    `/api/replies/${params.thread_id}`,
    fetcher
  );

  const messages = data?.messages || [];
  const thread = data?.thread;

  async function loadSummary() {
    setIsLoadingSummary(true);
    try {
      const r = await fetch(`/api/replies/${params.thread_id}/summary`, {
        method: "POST",
      });
      const { summary: summaryText } = await r.json();
      setSummary(summaryText);
    } catch (err) {
      console.error("Failed to load summary:", err);
    } finally {
      setIsLoadingSummary(false);
    }
  }

  async function loadSuggestions() {
    setIsLoadingSuggestions(true);
    try {
      const r = await fetch(`/api/replies/${params.thread_id}/suggestions`, {
        method: "POST",
      });
      const { suggestions: suggestionList } = await r.json();
      setSuggestions(suggestionList || []);
    } catch (err) {
      console.error("Failed to load suggestions:", err);
    } finally {
      setIsLoadingSuggestions(false);
    }
  }

  async function sendQuickReply() {
    if (!replyText.trim()) return;

    setIsSending(true);
    try {
      await fetch(`/api/replies/${params.thread_id}/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: replyText }),
      });
      setReplyText("");
      mutate(); // Refresh messages
    } catch (err) {
      console.error("Failed to send reply:", err);
    } finally {
      setIsSending(false);
    }
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-500">Error loading thread: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-6 w-full max-w-2xl mx-auto p-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Thread</h1>
            {thread?.intent_primary && (
              <IntentBadge intent={thread.intent_primary} />
            )}
          </div>

          {/* AI Summary Section */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">AI Summary</h2>
                <Button onClick={loadSummary} disabled={isLoadingSummary} size="sm">
                  {isLoadingSummary ? "Loading..." : "Generate Summary"}
                </Button>
              </div>
              {summary && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm whitespace-pre-line">{summary}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Messages List */}
          <Card>
            <CardContent className="space-y-4 p-4">
              {messages.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No messages found.</p>
              ) : (
                messages.map((m: any) => (
                  <div
                    key={m.id}
                    className={`p-3 rounded-xl ${
                      m.direction === "incoming"
                        ? "bg-muted"
                        : "bg-primary text-primary-foreground ml-8"
                    }`}
                  >
                    <div className="text-sm whitespace-pre-wrap">
                      {m.body_text || m.body || ""}
                    </div>
                    <div className="text-xs opacity-60 mt-1">
                      {new Date(m.created_at).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* AI Reply Suggestions */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">AI Reply Suggestions</h3>
                <Button onClick={loadSuggestions} disabled={isLoadingSuggestions} size="sm">
                  {isLoadingSuggestions ? "Loading..." : "Generate Suggestions"}
                </Button>
              </div>
              {suggestions.length > 0 && (
                <div className="space-y-2 mt-2">
                  {suggestions.map((s, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-lg bg-muted cursor-pointer hover:bg-muted/80 transition-colors"
                      onClick={() => setReplyText(s)}
                    >
                      <p className="text-sm">{s}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Reply Composer */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <Textarea
                id="quickreply"
                placeholder="Type a reply…"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={4}
              />
              <Button onClick={sendQuickReply} disabled={isSending || !replyText.trim()}>
                {isSending ? "Sending..." : "Send"}
              </Button>
            </CardContent>
          </Card>

          {/* Tasks Section */}
          {thread?.id && (
            <Card>
              <CardContent className="p-4">
                <ThreadTasks threadId={thread.id} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Lead Sidebar */}
      {thread?.lead_id && <LeadSidebar leadId={thread.lead_id} />}
    </div>
  );
}

