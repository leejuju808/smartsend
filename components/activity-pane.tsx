"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

type Event = {
  id: string;
  created_at: string;
  kind: string;
  note: string | null;
};

type OpenSummary = {
  firstOpenAt: string | null;
  messagesTracked: number;
  messagesOpened: number;
  opensCounted: number;
};

export function ActivityPane({
  threadId,
  leadId,
}: {
  threadId: string;
  leadId?: string | null;
}) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [events, setEvents] = useState<Event[]>([]);
  const [openSummary, setOpenSummary] = useState<OpenSummary | null>(null);
  const [summaryReady, setSummaryReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/activity?thread_id=${threadId}`);
      if (!cancelled && res.ok) {
        const data = await res.json();
        setEvents(Array.isArray(data) ? data : []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  useEffect(() => {
    let ignore = false;
    if (!leadId) {
      setOpenSummary(null);
      setSummaryReady(false);
      return;
    }

    async function loadSummary(id: string) {
      setSummaryReady(false);
      try {
        const [summaryRes, firstRes] = await Promise.all([
          sb
            .from("lead_open_summary")
            .select("messages_tracked, messages_opened, opens_counted")
            .eq("lead_id", id)
            .maybeSingle(),
          sb
            .from("open_stats")
            .select("first_open_at")
            .eq("lead_id", id)
            .not("first_open_at", "is", null)
            .order("first_open_at", { ascending: true })
            .limit(1)
            .maybeSingle(),
        ]);

        if (ignore) return;

        const summaryData = summaryRes.data ?? null;
        const firstData = firstRes.data ?? null;
        setOpenSummary({
          firstOpenAt: firstData?.first_open_at ?? null,
          messagesTracked: Number(summaryData?.messages_tracked ?? 0),
          messagesOpened: Number(summaryData?.messages_opened ?? 0),
          opensCounted: Number(summaryData?.opens_counted ?? 0),
        });
      } catch (error) {
        if (!ignore) {
          console.error("ActivityPane open summary load error", error);
          setOpenSummary({
            firstOpenAt: null,
            messagesTracked: 0,
            messagesOpened: 0,
            opensCounted: 0,
          });
        }
      } finally {
        if (!ignore) {
          setSummaryReady(true);
        }
      }
    }

    loadSummary(leadId);

    return () => {
      ignore = true;
    };
  }, [sb, leadId]);

  const firstOpenLabel = useMemo(() => {
    if (!openSummary?.firstOpenAt) return null;
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(openSummary.firstOpenAt));
    } catch (error) {
      console.error("ActivityPane open date format error", error);
      return new Date(openSummary.firstOpenAt).toLocaleString();
    }
  }, [openSummary?.firstOpenAt]);

  return (
    <div className="rounded-2xl border p-3 bg-muted/30 space-y-4">
      {leadId && summaryReady ? (
        <div className="space-y-1">
          <div className="text-sm font-medium">Lead engagement</div>
          <div className="text-xs text-muted-foreground">
            {openSummary && openSummary.messagesTracked > 0
              ? `${openSummary.messagesOpened}/${openSummary.messagesTracked} messages opened • ${openSummary.opensCounted} total opens`
              : "No tracked messages yet"}
          </div>
          {openSummary?.firstOpenAt ? (
            <div className="text-xs text-emerald-600">
              {firstOpenLabel ? `First opened ${firstOpenLabel}` : "Opened"}
            </div>
          ) : null}
        </div>
      ) : null}

      <div>
        <div className="text-sm font-medium mb-2">Activity</div>
        <div className="space-y-2 text-xs">
        {events.map((event) => (
          <div key={event.id} className="flex justify-between gap-4">
            <div className="min-w-0">
              <span className="font-medium">{event.kind}</span>
              {event.note ? ` — ${event.note}` : ""}
            </div>
            <div className="text-muted-foreground whitespace-nowrap">
              {new Date(event.created_at).toLocaleString()}
            </div>
          </div>
        ))}
        {!events.length && <div className="text-muted-foreground">No activity yet.</div>}
        </div>
      </div>
    </div>
  );
}





