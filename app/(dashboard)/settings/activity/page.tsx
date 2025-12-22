"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type ActivityLog = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, any>;
  created_at: string;
  user_id: string | null;
  profiles?: {
    email: string;
    full_name: string | null;
  };
};

export default function ActivityLogPage() {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [filterEntityType, setFilterEntityType] = useState<string>("all");
  const [filterAction, setFilterAction] = useState<string>("all");

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    loadWorkspace();
  }, []);

  useEffect(() => {
    if (workspaceId) {
      loadActivities();
    }
  }, [workspaceId, filterEntityType, filterAction]);

  async function loadWorkspace() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: membership } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (membership) {
        setWorkspaceId(membership.workspace_id);
      }
    } catch (error) {
      console.error("Error loading workspace:", error);
    }
  }

  async function loadActivities() {
    if (!workspaceId) return;

    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("limit", "100");
      if (filterEntityType !== "all") {
        params.set("entity_type", filterEntityType);
      }
      if (filterAction !== "all") {
        params.set("action", filterAction);
      }

      const response = await fetch(`/api/workspace/activity?${params.toString()}`, {
        headers: {
          "x-workspace-id": workspaceId,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Error loading activities:", data.error);
        return;
      }

      setActivities(data.activities || []);
    } catch (error) {
      console.error("Error loading activities:", error);
    } finally {
      setLoading(false);
    }
  }

  function formatAction(action: string): string {
    return action
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  function formatMetadata(metadata: Record<string, any>): string {
    if (!metadata || Object.keys(metadata).length === 0) return "";
    return JSON.stringify(metadata, null, 2);
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-lg font-semibold mb-4">Activity Log</div>
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Activity Log</h1>
        <p className="text-muted-foreground">
          View all workspace activity and changes
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Entity Type</label>
              <Select value={filterEntityType} onValueChange={setFilterEntityType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="campaign">Campaign</SelectItem>
                  <SelectItem value="workspace_invite">Invite</SelectItem>
                  <SelectItem value="workspace_member">Member</SelectItem>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="segment">Segment</SelectItem>
                  <SelectItem value="inbox">Inbox</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Action</label>
              <Select value={filterAction} onValueChange={setFilterAction}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="invite_created">Invite Created</SelectItem>
                  <SelectItem value="invite_accepted">Invite Accepted</SelectItem>
                  <SelectItem value="member_role_updated">Role Updated</SelectItem>
                  <SelectItem value="member_removed">Member Removed</SelectItem>
                  <SelectItem value="campaign_created">Campaign Created</SelectItem>
                  <SelectItem value="campaign_updated">Campaign Updated</SelectItem>
                  <SelectItem value="leads_uploaded">Leads Uploaded</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activity List */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity ({activities.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {activities.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">
              No activity found
            </div>
          ) : (
            <div className="space-y-4">
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  className="border-b pb-4 last:border-0 last:pb-0"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline">{formatAction(activity.action)}</Badge>
                        <span className="text-sm text-muted-foreground">
                          {activity.entity_type}
                        </span>
                      </div>
                      <div className="text-sm">
                        {activity.profiles?.full_name || activity.profiles?.email || "System"}
                        {activity.profiles?.email && activity.profiles?.full_name && (
                          <span className="text-muted-foreground ml-1">
                            ({activity.profiles.email})
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(activity.created_at).toLocaleString()}
                    </div>
                  </div>
                  {Object.keys(activity.metadata || {}).length > 0 && (
                    <div className="mt-2 text-xs text-muted-foreground bg-gray-50 p-2 rounded">
                      <pre className="whitespace-pre-wrap">
                        {formatMetadata(activity.metadata)}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}



