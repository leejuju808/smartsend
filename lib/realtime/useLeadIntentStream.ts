// lib/realtime/useLeadIntentStream.ts
"use client";

import { useEffect } from "react";
import { SupabaseClient } from "@supabase/supabase-js";

export type LeadIntentEvent = {
  id: string;
  created_at: string;
  account_id: string;
  campaign_id: string | null;
  contact_id: string | null;
  thread_id: string | null;
  message_id: string | null;
  intent: string;
  confidence: number | null;
  raw_payload: any;
};

type UseLeadIntentStreamProps = {
  supabase: SupabaseClient;
  accountId: string | null;
  /**
   * Called every time a new intent event is created.
   * Use this to update dashboard counters, lists, or show a toast.
   */
  onEvent: (event: LeadIntentEvent) => void;
};

export function useLeadIntentStream({
  supabase,
  accountId,
  onEvent,
}: UseLeadIntentStreamProps) {
  useEffect(() => {
    if (!accountId) return;

    const channel = supabase
      .channel(`lead-intent-events:${accountId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "lead_intent_events",
          filter: `account_id=eq.${accountId}`,
        },
        (payload) => {
          onEvent(payload.new as LeadIntentEvent);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("[LeadIntentStream] subscribed");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, accountId, onEvent]);
}






























































