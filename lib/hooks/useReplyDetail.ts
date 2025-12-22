"use client";

import { useCallback, useEffect, useState } from "react";

export type ReplyDetail = {
  id: string;
  workspace_id: string;
  lead_email: string | null;
  subject: string | null;
  received_at: string;
  body_html: string | null;
  body_text: string | null;
  ai_category: string | null;
  ai_intent: string | null;
  ai_has_meeting: boolean | null;
  ai_stop_followups: boolean | null;
  status: string | null;
  owner_user_id: string | null;
  meeting_stage: string | null;
  deal_value_cents: number | null;
  meeting_note: string | null;
};

type ReplyDetailResponse = {
  reply: ReplyDetail;
};

export function useReplyDetail(replyId: string | null) {
  const [data, setData] = useState<ReplyDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!replyId) {
      setData(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/inbox/replies/${replyId}`);
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Failed to load reply");
        setData(null);
      } else {
        setData(json.reply);
      }
    } catch (err: any) {
      console.error("useReplyDetail error", err);
      setError("Failed to load reply");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [replyId]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}

