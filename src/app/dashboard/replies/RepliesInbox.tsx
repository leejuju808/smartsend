"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useInboxStore, EmailRow } from "@/lib/inboxStore";
import { useRepliesRealtime } from "@/lib/hooks/useRepliesRealtime";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Clock } from "lucide-react";
import SyncNowButton from "./SyncNowButton";
import ThreadDrawer from "@/components/inbox/ThreadDrawer";

export default function RepliesInbox() {
  const supabase = createClientComponentClient();
  const { rows, setRows, merge, counts } = useInboxStore();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openThread, setOpenThread] = useState<string | null>(null);

  // Fetch user ID
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
    })();
  }, [supabase]);

  // Initial fetch
  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await supabase
        .from("emails")
        .select("id, user_id, from_email, subject, preview, status, has_replied, thread_id, created_at, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(100);
      setRows((data ?? []) as EmailRow[]);
      setLoading(false);
    })();
  }, [userId, supabase, setRows]);

  // Realtime updates
  useRepliesRealtime(
    userId,
    (evt) => {
      if (evt.table === "emails") {
        if (evt.type === "insert" || evt.type === "update") {
          merge(evt.row as EmailRow);
        } else if (evt.type === "delete") {
          // Handle delete if needed
        }
      }
    }
  );

  // Listen for local optimistic updates
  useEffect(() => {
    const onLocal = (e: any) => {
      const existing = rows.find(r => r.id === e.detail.id);
      if (existing) {
        merge({ ...existing, ...e.detail.patch });
      }
    };
    window.addEventListener("inbox-local-update", onLocal as EventListener);
    return () => window.removeEventListener("inbox-local-update", onLocal as EventListener);
  }, [rows, merge]);

  const onMarkReplied = async (id: string) => {
    const { error } = await supabase
      .from("emails")
      .update({ status: "replied", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) console.error("Failed to mark replied:", error);
  };

  const onSnooze = async (id: string) => {
    const { error } = await supabase
      .from("emails")
      .update({ status: "snoozed", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) console.error("Failed to snooze:", error);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-3 border-b">
        <h2 className="text-lg font-semibold">Replies Inbox</h2>
        <Badge variant="secondary">Open {counts.open}</Badge>
        <Badge variant="secondary">Replied {counts.replied}</Badge>
        <Badge variant="secondary">Snoozed {counts.snoozed}</Badge>
        <Badge variant="secondary">Closed {counts.closed}</Badge>
        <div className="ml-auto flex items-center gap-2">
          <SyncNowButton />
          <Button variant="outline" onClick={() => location.reload()}>Refresh</Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && rows.length === 0 ? (
          <div className="p-6 text-center text-sm opacity-70">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-sm opacity-70">No emails.</div>
        ) : (
          rows.map((m) => (
            <div
              key={m.id}
              className="p-3 border-b hover:bg-muted cursor-pointer"
              onClick={() => {
                if (m.thread_id) {
                  setOpenThread(m.thread_id);
                }
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-medium">{m.subject || "(no subject)"}</div>
                  <div className="text-sm text-muted-foreground truncate">{m.preview}</div>
                  <div className="text-xs text-muted-foreground mt-1">{m.from_email}</div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <div className="text-xs text-muted-foreground">
                    {new Date(m.updated_at).toLocaleString()}
                  </div>
                  {m.has_replied && (
                    <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-md">
                      Replied
                    </span>
                  )}
                  <Badge variant={m.status === "open" ? "default" : "secondary"}>
                    {m.status}
                  </Badge>
                  {m.status === "open" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          onMarkReplied(m.id);
                        }}
                      >
                        <Check className="h-3 w-3 mr-1" /> Mark Replied
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSnooze(m.id);
                        }}
                      >
                        <Clock className="h-3 w-3 mr-1" /> Snooze
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      {openThread && <ThreadDrawer threadId={openThread} onClose={() => setOpenThread(null)} />}
    </div>
  );
}
