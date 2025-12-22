"use client";

import { useEffect, useMemo, useState } from "react";
import { getBrowserSupabase } from "@/utils/supabase/client";
import type { Database } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/Textarea";
import { Separator } from "@/components/ui/separator";

type Message = Database["public"]["Tables"]["messages"]["Row"];

const PAGE_SIZE = 20;

export default function RepliesInbox() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [threads, setThreads] = useState<Map<string, Message[]>>(new Map());
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);

  const supabase = getBrowserSupabase();

  // Get authenticated user
  useEffect(() => {
    async function getAccountId() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setAccountId(user.id);
      }
    }
    getAccountId();
  }, [supabase]);

  // Fetch messages
  useEffect(() => {
    if (!accountId) return;

    async function fetchMessages() {
      setLoading(true);
      try {
        let query = supabase
          .from("messages")
          .select("*")
          .eq("account_id", accountId)
          .eq("direction", "in")
          .order("date", { ascending: false });

        if (search.trim()) {
          query = query.or(`subject.ilike.%${search}%,snippet.ilike.%${search}%,body.ilike.%${search}%,from_email.ilike.%${search}%`);
        }

        const { data, error } = await query
          .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

        if (error) {
          console.error("Error fetching messages:", error);
          return;
        }

        setMessages(data || []);

        // Group by thread_id
        const threadMap = new Map<string, Message[]>();
        (data || []).forEach((msg) => {
          const tid = msg.thread_id || msg.id;
          if (!threadMap.has(tid)) {
            threadMap.set(tid, []);
          }
          threadMap.get(tid)!.push(msg);
        });

        // Load full threads for visible threads
        for (const [tid, msgs] of threadMap.entries()) {
          const { data: threadData } = await supabase
            .from("messages")
            .select("*")
            .or(`thread_id.eq.${tid},id.eq.${tid}`)
            .eq("account_id", accountId)
            .order("date", { ascending: true });

          if (threadData) {
            threadMap.set(tid, threadData);
          }
        }

        setThreads(threadMap);
      } catch (err) {
        console.error("Error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchMessages();
  }, [accountId, search, page, supabase]);

  // Realtime subscription
  useEffect(() => {
    if (!accountId) return;

    const channel = supabase
      .channel("messages-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `account_id=eq.${accountId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            setMessages((prev) => {
              const idx = prev.findIndex((m) => m.id === newMsg.id);
              if (idx === -1) {
                return [newMsg, ...prev].slice(0, PAGE_SIZE);
              }
              const next = [...prev];
              next[idx] = newMsg;
              return next;
            });

            // Update thread
            const tid = newMsg.thread_id || newMsg.id;
            setThreads((prev) => {
              const next = new Map(prev);
              const existing = next.get(tid) || [];
              const existingIdx = existing.findIndex((m) => m.id === newMsg.id);
              if (existingIdx === -1) {
                next.set(tid, [...existing, newMsg]);
              } else {
                const updated = [...existing];
                updated[existingIdx] = newMsg;
                next.set(tid, updated);
              }
              return next;
            });
          } else if (payload.eventType === "DELETE") {
            setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [accountId, supabase]);

  // Mark as read
  async function markAsRead(msg: Message) {
    if (msg.is_read) return;

    const { error } = await supabase
      .from("messages")
      .update({ is_read: true })
      .eq("id", msg.id);

    if (error) {
      console.error("Error marking as read:", error);
      return;
    }

    // Update local state
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, is_read: true } : m))
    );

    const tid = msg.thread_id || msg.id;
    setThreads((prev) => {
      const next = new Map(prev);
      const existing = next.get(tid) || [];
      next.set(
        tid,
        existing.map((m) => (m.id === msg.id ? { ...m, is_read: true } : m))
      );
      return next;
    });
  }

  // Select thread
  function selectThread(msg: Message) {
    const tid = msg.thread_id || msg.id;
    setSelectedThreadId(tid);
    if (!msg.is_read) {
      markAsRead(msg);
    }
  }

  // Send reply
  async function handleSendReply() {
    if (!replyingTo || !replyText.trim() || !accountId) return;

    setSending(true);
    try {
      const res = await fetch("/api/replies/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: replyingTo.thread_id || replyingTo.id,
          subject: replyingTo.subject ? `Re: ${replyingTo.subject}` : "Re: Message",
          body: replyText,
          to_email: replyingTo.from_email,
          from_email: replyingTo.to_email || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to send reply");
      }

      setReplyingTo(null);
      setReplyText("");
      
      // Refresh messages
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("account_id", accountId)
        .eq("direction", "in")
        .order("date", { ascending: false })
        .limit(PAGE_SIZE);

      if (data) {
        setMessages(data);
      }
    } catch (err) {
      console.error("Error sending reply:", err);
      alert(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setSending(false);
    }
  }

  const selectedThread = selectedThreadId ? threads.get(selectedThreadId) || [] : [];
  const unreadCount = messages.filter((m) => !m.is_read).length;

  // Group messages by thread for list view
  const threadList = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ threadId: string; latestMsg: Message; unread: boolean }> = [];

    messages.forEach((msg) => {
      const tid = msg.thread_id || msg.id;
      if (seen.has(tid)) return;
      seen.add(tid);

      list.push({
        threadId: tid,
        latestMsg: msg,
        unread: !msg.is_read,
      });
    });

    return list.sort((a, b) => {
      const dateA = a.latestMsg.date || "";
      const dateB = b.latestMsg.date || "";
      return dateB.localeCompare(dateA);
    });
  }, [messages]);

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="border-b p-4 flex items-center justify-between bg-background">
        <div>
          <h1 className="text-2xl font-semibold">Replies Inbox</h1>
          {unreadCount > 0 && (
            <Badge variant="default" className="mt-1">
              {unreadCount} unread
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search messages..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-64"
          />
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Thread List */}
        <div className="w-80 border-r bg-muted/30 flex flex-col">
          <div className="p-2 border-b">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPage(1);
                window.location.reload();
              }}
            >
              Refresh
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-sm text-muted-foreground">Loading...</div>
            ) : threadList.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                {search ? "No messages found." : "No messages yet."}
              </div>
            ) : (
              threadList.map(({ threadId, latestMsg, unread }) => (
                <div
                  key={threadId}
                  onClick={() => selectThread(latestMsg)}
                  className={`p-3 border-b cursor-pointer hover:bg-accent transition-colors ${
                    selectedThreadId === threadId ? "bg-accent" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">
                          {latestMsg.from_email || "Unknown"}
                        </span>
                        {unread && (
                          <Badge variant="default" className="h-2 w-2 p-0 rounded-full" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-1">
                        {latestMsg.snippet || latestMsg.subject || latestMsg.body?.slice(0, 50) || "No preview"}
                      </p>
                      {latestMsg.date && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(latestMsg.date).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          {!loading && threadList.length > 0 && (
            <div className="p-2 border-t flex items-center justify-between text-sm">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <span className="text-muted-foreground">Page {page}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={threadList.length < PAGE_SIZE}
              >
                Next
              </Button>
            </div>
          )}
        </div>

        {/* Conversation View */}
        <div className="flex-1 flex flex-col bg-background">
          {selectedThreadId && selectedThread.length > 0 ? (
            <>
              <div className="p-4 border-b">
                <h2 className="font-semibold">
                  {selectedThread[0]?.subject || "Conversation"}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedThread[0]?.from_email}
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {selectedThread.map((msg) => (
                  <Card key={msg.id} className={msg.direction === "out" ? "ml-auto max-w-[80%]" : "mr-auto max-w-[80%]"}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">
                          {msg.direction === "out" ? "You" : msg.from_email || "Unknown"}
                        </CardTitle>
                        {msg.date && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(msg.date).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="prose prose-sm max-w-none">
                        {msg.body ? (
                          <div dangerouslySetInnerHTML={{ __html: msg.body }} />
                        ) : (
                          <p className="text-sm">{msg.snippet || "No content"}</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="p-4 border-t">
                <Button
                  onClick={() => {
                    const firstInbound = selectedThread.find((m) => m.direction === "in");
                    if (firstInbound) {
                      setReplyingTo(firstInbound);
                    }
                  }}
                >
                  Reply
                </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              Select a conversation to view messages
            </div>
          )}
        </div>
      </div>

      {/* Reply Dialog */}
      <Dialog open={!!replyingTo} onOpenChange={(open) => !open && setReplyingTo(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Reply to {replyingTo?.from_email || "Message"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Subject</label>
              <Input
                value={replyingTo?.subject ? `Re: ${replyingTo.subject}` : "Re: Message"}
                disabled
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">To</label>
              <Input
                value={replyingTo?.from_email || ""}
                disabled
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Message</label>
              <Textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Type your reply..."
                className="mt-1 min-h-[200px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReplyingTo(null);
                setReplyText("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSendReply} disabled={!replyText.trim() || sending}>
              {sending ? "Sending..." : "Send Reply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}