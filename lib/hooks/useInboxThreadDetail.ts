"use client";

import { useCallback, useEffect, useState } from "react";

export type ThreadEventOutbound = {
  id: string;
  kind: "outbound";
  at: string;
  subject: string | null;
  body: string | null;
  sender_email: string | null;
};

export type ThreadEventInbound = {
  id: string;
  kind: "inbound";
  at: string;
  subject: string | null;
  body: string | null;
  ai_category: string | null;
  ai_intent: string | null;
  ai_has_meeting: boolean;
  ai_stop_followups: boolean;
};

export type ThreadEvent = ThreadEventOutbound | ThreadEventInbound;

export type ThreadDetail = {
  lead: {
    id: string;
    email: string | null;
    first_name?: string | null;
    last_name?: string | null;
    company?: string | null;
  } | null;
  campaign: {
    id: string;
    name: string | null;
  } | null;
  events: ThreadEvent[];
  thread_status: "open" | "handled";
  followups?: {
    stop_followups: boolean;
    stopped_at: string | null;
  };
  meeting?: {
    status: "pending" | "booked" | "completed" | "no_show" | "canceled";
    meeting_at: string | null;
    notes: string | null;
  } | null;
};

export function useInboxThreadDetail(
  leadId: string | null,
  campaignId: string | null
) {
  const [data, setData] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!leadId || !campaignId) {
      setData(null);
      return;
    }

    setLoading(true);
    const params = new URLSearchParams({
      leadId,
      campaignId,
    });

    const res = await fetch(`/api/inbox/thread?${params.toString()}`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [leadId, campaignId]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, reload: load };
}

