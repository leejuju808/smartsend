"use client";

import { useEffect, useState } from "react";

type Activity = {
  id: string;
  event_type: string;
  description: string;
  metadata: any;
  created_at: string;
  lead_first_name: string | null;
  lead_last_name: string | null;
  lead_email: string | null;
  lead_company: string | null;
  campaign_name: string | null;
};

export function ResourceActivity({
  campaignId,
  leadId,
  workspaceId,
}: {
  campaignId?: string;
  leadId?: string;
  workspaceId?: string;
}) {
  const [events, setEvents] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const res = await fetch("/api/activity/list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            campaignId,
            leadId,
          }),
        });
        const json = await res.json();
        if (res.ok && json.events) {
          setEvents(json.events || []);
        }
      } catch (error) {
        console.error("Failed to load resource activity:", error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [workspaceId, campaignId, leadId]);

  if (loading) {
    return <div className="text-xs text-muted-foreground">Loading activity...</div>;
  }

  if (events.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">No activity yet.</div>
    );
  }

  return (
    <div className="space-y-1 text-xs">
      {events.map((e) => (
        <div key={e.id} className="border rounded px-2 py-1 bg-muted/50">
          <div className="font-medium">{e.description}</div>
          <div className="text-[10px] text-muted-foreground">
            {new Date(e.created_at).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}







