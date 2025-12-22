"use client";

import { useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useThreads } from "@/hooks/useThreads";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

export default function RepliesInboxThreads() {
  const supabase = createClientComponentClient();
  const { rows: threads, loading } = useThreads({}); // add campaignId filter if desired
  const [openId, setOpenId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const openThread = async (id: string) => {
    setOpenId(id);
    await supabase.rpc("mark_thread_read", { p_thread_id: id });
  };

  const sendReply = async () => {
    if (!openId || !message.trim() || sending) return;
    
    setSending(true);
    try {
      const { data, error } = await fetch("/api/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: openId, body: message }),
      }).then(r => r.json());
      
      if (!error) {
        setMessage("");
        // Thread will update via realtime
      } else {
        alert(`Error: ${error}`);
      }
    } catch (err) {
      console.error("Send error:", err);
      alert("Failed to send reply");
    } finally {
      setSending(false);
    }
  };

  const thread = threads.find(r => r.id === openId);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-4">Replies Inbox ⚡ (Threads)</h1>
        <p className="text-gray-500">Loading threads...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Replies Inbox ⚡ (Threads)</h1>

      <div className="grid gap-3">
        {threads.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No threads found.</p>
        ) : (
          threads.map(t => (
            <Card key={t.id} className="hover:shadow transition cursor-pointer" onClick={() => openThread(t.id)}>
              <CardHeader className="flex-row justify-between items-start pb-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="secondary">{t.leads?.email ?? "Unknown"}</Badge>
                    {t.unread_count > 0 && (
                      <Badge className="bg-blue-500">{t.unread_count} new</Badge>
                    )}
                  </div>
                  <p className="font-medium truncate">{t.subject || "(no subject)"}</p>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(t.last_message_at).toLocaleString()}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {t.last_message_snippet || "(no preview)"}
                </p>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Sheet open={!!openId} onOpenChange={(v) => !v && setOpenId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{thread?.subject || "Thread"}</SheetTitle>
            <div className="text-sm text-muted-foreground">
              {thread?.leads?.name && <span>{thread.leads.name} · </span>}
              {thread?.leads?.email}
            </div>
          </SheetHeader>

          {/* TODO: Load and display actual messages */}
          <div className="mt-4 text-sm text-muted-foreground">
            Message history will be loaded here
          </div>

          {/* Inline composer */}
          <div className="mt-4 space-y-2">
            <Textarea
              placeholder="Write your reply…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-[140px]"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setMessage("")} disabled={sending}>
                Clear
              </Button>
              <Button onClick={sendReply} disabled={sending || !message.trim()}>
                {sending ? "Sending..." : "Send"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

