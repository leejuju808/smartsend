"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Badge } from "@/components/ui/badge";

type QueueStatus = "queued" | "sending" | "sent" | "failed" | "paused" | null;

export function QueueStatusBadge({ threadId }: { threadId: string }) {
  const [status, setStatus] = useState<QueueStatus>(null);
  const supabase = createClient();

  useEffect(() => {
    if (!threadId) return;

    async function checkQueueStatus() {
      const { data } = await supabase
        .from("send_queue")
        .select("status")
        .eq("thread_id", threadId)
        .in("status", ["queued", "sending", "failed"])
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      setStatus(data?.status || null);
    }

    checkQueueStatus();
    const interval = setInterval(checkQueueStatus, 5000); // Check every 5s
    return () => clearInterval(interval);
  }, [threadId]);

  if (!status) return null;

  const statusColors: Record<string, string> = {
    queued: "bg-yellow-100 text-yellow-800",
    sending: "bg-blue-100 text-blue-800",
    failed: "bg-red-100 text-red-800",
    paused: "bg-gray-100 text-gray-800",
  };

  return (
    <Badge className={statusColors[status] || ""} variant="outline">
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

