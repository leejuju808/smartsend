"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type QueueItem = {
  id: string;
  subject: string | null;
  scheduled_at: string;
  status: "queued" | "sending" | "sent" | "failed" | "paused";
  error: string | null;
  attempts: number;
  max_attempts: number;
  mailbox_id: string;
  thread_id: string | null;
  lead_id: string | null;
  mailbox?: {
    display_name: string | null;
    from_email: string | null;
  };
};

export default function SendQueuePage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "queued" | "sending" | "failed">("all");
  const [mailboxFilter, setMailboxFilter] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    loadQueue();
    const interval = setInterval(loadQueue, 5000); // Refresh every 5s
    return () => clearInterval(interval);
  }, [filter, mailboxFilter]);

  async function loadQueue() {
    setLoading(true);
    let query = supabase
      .from("send_queue")
      .select(`
        *,
        mailbox:mailboxes(id, display_name, from_email)
      `)
      .order("scheduled_at", { ascending: true });

    if (filter !== "all") {
      query = query.eq("status", filter);
    }

    if (mailboxFilter) {
      query = query.eq("mailbox_id", mailboxFilter);
    }

    const { data, error } = await query.limit(500);

    if (error) {
      console.error("Error loading queue:", error);
    } else {
      setItems((data || []) as QueueItem[]);
    }
    setLoading(false);
  }

  async function retryFailed(id: string) {
    const { error } = await supabase
      .from("send_queue")
      .update({
        status: "queued",
        error: null,
        backoff_seconds: 0,
        scheduled_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      alert(`Failed to retry: ${error.message}`);
    } else {
      loadQueue();
    }
  }

  const statusColors: Record<string, string> = {
    queued: "bg-yellow-100 text-yellow-800",
    sending: "bg-blue-100 text-blue-800",
    sent: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
    paused: "bg-gray-100 text-gray-800",
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Send Queue</h1>
        <Button onClick={loadQueue} disabled={loading}>
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="flex gap-2">
          {(["all", "queued", "sending", "failed"] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {/* Queue Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subject</TableHead>
              <TableHead>Mailbox</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Scheduled</TableHead>
              <TableHead>Attempts</TableHead>
              <TableHead>Error</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-4">
                  Loading...
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-4 text-gray-500">
                  No items in queue
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.subject || "(no subject)"}
                  </TableCell>
                  <TableCell>
                    {item.mailbox?.display_name || item.mailbox?.from_email || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[item.status] || ""}>
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {new Date(item.scheduled_at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {item.attempts}/{item.max_attempts}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-sm text-red-600">
                    {item.error || "—"}
                  </TableCell>
                  <TableCell>
                    {item.status === "failed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => retryFailed(item.id)}
                      >
                        Retry
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-sm text-gray-500">
        Showing {items.length} item(s). Queue refreshes automatically every 5 seconds.
      </div>
    </div>
  );
}

