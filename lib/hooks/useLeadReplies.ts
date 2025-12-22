"use client";

import { useEffect, useMemo, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

export type Lead = {
  id: string;
  email: string;
  name?: string | null;
  last_message_snippet?: string | null;
  has_replied: boolean;
  campaign_id?: string | null;
};

type Options = {
  campaignId?: string;     // optional filter to limit events to one campaign
};

export function useLeadReplies(initialLeads: Lead[], opts: Options = {}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [leads, setLeads] = useState<Lead[]>(initialLeads || []);

  // map for quick lookup
  const idx = useMemo(() => {
    const m = new Map<string, number>();
    leads.forEach((l, i) => m.set(l.id, i));
    return m;
  }, [leads]);

  useEffect(() => {
    const channel = supabase
      .channel(`replies:${opts.campaignId ?? "all"}`)
      .on<RealtimePostgresChangesPayload<Lead>>(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "campaign_leads",
          ...(opts.campaignId ? { filter: `campaign_id=eq.${opts.campaignId}` } : {}),
        },
        (payload) => {
          const newRow = payload.new as any;
          const oldRow = payload.old as any;
          // only care if has_replied flipped from false to true
          if (!oldRow?.has_replied && newRow?.has_replied && newRow?.id) {
            setLeads((prev) => {
              const copy = [...prev];
              const i = idx.get(newRow.id);
              if (typeof i === "number") copy[i] = { ...copy[i], ...newRow };
              else copy.unshift(newRow); // if not present, prepend
              return copy;
            });
          }
        }
      )
      .subscribe((status) => {
        console.log(`Realtime subscription status: ${status}`);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, idx, opts.campaignId]);

  return { leads, setLeads };
}

