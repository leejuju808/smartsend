"use client";
import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/utils/supabase/client";

export type EmailLog = {
  id: string;
  to_email: string;
  subject: string;
  status: "queued" | "sent" | "delivered" | "opened" | "replied" | "failed" | "skipped_suppressed" | "clicked" | null;
  opened: boolean;
  clicked: boolean;
  opened_at?: string | null;
  clicked_at?: string | null;
  sent_at: string | null;
  created_at?: string;
  campaign_id?: string;
  user_id?: string;
  workspace_id?: string;
  attempts?: number;
  // Enhanced tracking fields
  open_count?: number;
  click_count?: number;
  first_opened_at?: string | null;
  last_opened_at?: string | null;
};

export function useRealtimeEmailLogs(initial: EmailLog[] = []) {
  const [rows, setRows] = useState<EmailLog[]>(initial);

  useEffect(() => {
    const supabase = getBrowserSupabase();

    // Upsert helper
    const upsert = (r: EmailLog) =>
      setRows((prev) => {
        const i = prev.findIndex((x) => x.id === r.id);
        if (i === -1) return [r, ...prev].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
        const next = [...prev];
        next[i] = { ...next[i], ...r };
        return next;
      });

    // Subscribe to INSERT + UPDATE on email_logs
    const channel = supabase
      .channel("email_logs_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "email_logs" },
        (payload: any) => {
          const rec = (payload.new || payload.record) as EmailLog;
          if (!rec) return;
          upsert(rec);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return rows;
}