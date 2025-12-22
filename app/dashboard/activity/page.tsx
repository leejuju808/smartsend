"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

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

export default function ActivityPage() {
  const [events, setEvents] = useState<Activity[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = createClientComponentClient();

  useEffect(() => {
    const load = async () => {
      // Get workspace_id
      let wsId = workspaceId;
      if (!wsId) {
        // Try localStorage
        const wsFromStorage =
          typeof window !== "undefined"
            ? localStorage.getItem("active_workspace")
            : null;

        if (wsFromStorage) {
          wsId = wsFromStorage;
        } else {
          // Get user's first workspace
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user) {
            const { data } = await supabase
              .from("workspace_members")
              .select("workspace_id")
              .eq("user_id", user.id)
              .limit(1)
              .maybeSingle();

            if (data) {
              wsId = data.workspace_id;
            }
          }
        }
      }

      if (!wsId) {
        setLoading(false);
        return;
      }

      setWorkspaceId(wsId);

      // Fetch activity
      try {
        const res = await fetch("/api/activity/list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspaceId: wsId,
          }),
        });
        const json = await res.json();
        if (res.ok && json.events) {
          setEvents(json.events || []);
        }
      } catch (error) {
        console.error("Failed to load activity:", error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [supabase, workspaceId]);

  const filtered = events.filter((e) => {
    if (typeFilter && e.event_type !== typeFilter) return false;
    if (!search) return true;

    const haystack = [
      e.description,
      e.lead_email,
      e.lead_company,
      e.campaign_name,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(search.toLowerCase());
  });

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm">Loading activity...</div>
      </div>
    );
  }

  if (!workspaceId) {
    return (
      <div className="p-6">
        <div className="text-red-600">Error: Unable to load workspace.</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Workspace Activity</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-3">
          <Input
            placeholder="Search by description, lead, campaign..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="md:flex-1"
          />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Event type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              <SelectItem value="campaign_created">Campaign created</SelectItem>
              <SelectItem value="campaign_launched">Campaign launched</SelectItem>
              <SelectItem value="leads_imported">Leads imported</SelectItem>
              <SelectItem value="reply_received">Reply received</SelectItem>
              <SelectItem value="meeting_created">Meeting created</SelectItem>
              <SelectItem value="billing_limit_hit">Billing limit hit</SelectItem>
              <SelectItem value="template_rewritten">Template rewritten</SelectItem>
              <SelectItem value="ai_reply_used">AI reply used</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 max-h-[70vh] overflow-y-auto">
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground">No activity yet.</p>
          )}

          {filtered.map((e) => (
            <div
              key={e.id}
              className="border rounded px-3 py-2 text-xs bg-background space-y-1"
            >
              <div className="flex justify-between items-center">
                <span className="uppercase text-[10px] text-muted-foreground tracking-wide">
                  {e.event_type}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(e.created_at).toLocaleString()}
                </span>
              </div>
              <div className="font-medium">{e.description}</div>

              {(e.lead_email || e.campaign_name) && (
                <div className="text-[11px] text-muted-foreground">
                  {e.lead_email && (
                    <span>
                      Lead: {e.lead_first_name} {e.lead_last_name} ({e.lead_email}){" "}
                    </span>
                  )}
                  {e.campaign_name && <span>· Campaign: {e.campaign_name}</span>}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}







