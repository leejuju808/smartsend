"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/utils/supabase/client";

export interface ReplyInbox {
  id: string;
  lead_email: string;
  subject: string | null;
  snippet: string | null;
  received_at: string;
  thread_id: string | null;
  campaign_id: string | null;
}

export function useRepliesInbox(campaignId?: string) {
  const [replies, setReplies] = useState<ReplyInbox[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchReplies() {
      setLoading(true);
      const supabase = getBrowserSupabase();
      
      let query = supabase
        .from("replies")
        .select("id, from_email, subject, snippet, created_at, thread_id, campaign_id")
        .order("created_at", { ascending: false });
      
      if (campaignId) {
        query = query.eq("campaign_id", campaignId);
      }

      const { data, error } = await query;
      
      if (error) {
        console.error("Error fetching replies:", error);
        setReplies([]);
      } else {
        // Map from_email to lead_email to match the spec
        const formatted = (data || []).map((reply) => ({
          id: reply.id,
          lead_email: reply.from_email || "",
          subject: reply.subject,
          snippet: reply.snippet,
          received_at: reply.created_at, // Use created_at as received_at
          thread_id: reply.thread_id,
          campaign_id: reply.campaign_id,
        }));
        setReplies(formatted);
      }
      
      setLoading(false);
    }

    fetchReplies();
  }, [campaignId]);

  return { replies, loading };
}

