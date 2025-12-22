"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  RefreshCw,
  Reply,
  Zap,
  Pause,
  Upload,
  Rocket,
  Filter,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
// Using native select for simplicity

type ActivityType =
  | "email_sent"
  | "followup_triggered"
  | "reply_received"
  | "classified"
  | "sequence_paused"
  | "import"
  | "campaign_launched";

interface ActivityLog {
  id: string;
  workspace_id: string;
  user_id: string | null;
  campaign_id: string | null;
  lead_id: string | null;
  type: ActivityType;
  metadata: Record<string, any>;
  created_at: string;
}

interface SummaryCounts {
  emails_sent: number;
  followups_triggered: number;
  replies_received: number;
  hot_leads: number;
}

const ICONS: Record<ActivityType, typeof Mail> = {
  email_sent: Mail,
  followup_triggered: RefreshCw,
  reply_received: Reply,
  classified: Zap,
  sequence_paused: Pause,
  import: Upload,
  campaign_launched: Rocket,
};

const TYPE_LABELS: Record<ActivityType, string> = {
  email_sent: "Email Sent",
  followup_triggered: "Follow-Up Triggered",
  reply_received: "Reply Received",
  classified: "Lead Classified",
  sequence_paused: "Sequence Paused",
  import: "Import",
  campaign_launched: "Campaign Launched",
};

function formatActivityDescription(log: ActivityLog): string {
  const { type, metadata } = log;

  switch (type) {
    case "email_sent":
      const toName = metadata.to_name || metadata.to_email?.split("@")[0] || "Contact";
      return `Sent Message 1 to ${toName}.${metadata.template_name ? ` Template: ${metadata.template_name}.` : ""}`;

    case "followup_triggered":
      const followupName = metadata.to_name || metadata.to_email?.split("@")[0] || "Contact";
      const followupNum = metadata.followup_number || 1;
      const daysSince = metadata.days_since_last || 0;
      return `Sent Follow-Up ${followupNum} to ${followupName}${daysSince > 0 ? ` (no reply after ${daysSince} day${daysSince > 1 ? "s" : ""})` : ""}.`;

    case "reply_received":
      const replyName = metadata.from_name || metadata.from_email?.split("@")[0] || "Homeowner";
      const preview = metadata.reply_preview ? `: "${metadata.reply_preview.slice(0, 50)}..."` : "";
      return `New reply from ${replyName}${preview}`;

    case "classified":
      const leadName = metadata.lead_name || metadata.lead_email?.split("@")[0] || "Lead";
      const classification = metadata.classification || "unknown";
      const reason = metadata.reason ? ` (${metadata.reason})` : "";
      return `Classified ${leadName} as ${classification.toUpperCase()}${reason}.`;

    case "sequence_paused":
      const pausedName = metadata.lead_name || metadata.lead_email?.split("@")[0] || "Contact";
      return `Paused sequence for ${pausedName} — ${metadata.reason || "replied"}.`;

    case "import":
      return `Imported ${metadata.count || 0} contact${metadata.count !== 1 ? "s" : ""}${metadata.list_name ? ` into '${metadata.list_name}'` : ""}.`;

    case "campaign_launched":
      const campaignName = metadata.campaign_name || "Campaign";
      return `Campaign launched: '${campaignName}'. (${metadata.contact_count || 0} contact${metadata.contact_count !== 1 ? "s" : ""})`;

    default:
      return "Activity logged";
  }
}

function formatTimeAgo(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString();
}

export default function ActivityLog() {
  const supabase = createClientComponentClient();
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [summary, setSummary] = useState<SummaryCounts>({
    emails_sent: 0,
    followups_triggered: 0,
    replies_received: 0,
    hot_leads: 0,
  });
  const [filter, setFilter] = useState<ActivityType | "all">("all");
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  // Get workspace ID
  useEffect(() => {
    async function getWorkspace() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: member } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (member?.workspace_id) {
        setWorkspaceId(member.workspace_id);
      }
    }
    getWorkspace();
  }, [supabase]);

  // Fetch activities
  const fetchActivities = async () => {
    if (!workspaceId) return;

    setLoading(true);
    try {
      let query = supabase
        .from("activity_logs")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (filter !== "all") {
        query = query.eq("type", filter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setActivities(data || []);

      // Calculate summary (today only)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayActivities = (data || []).filter(
        (a) => new Date(a.created_at) >= today
      );

      setSummary({
        emails_sent: todayActivities.filter((a) => a.type === "email_sent").length,
        followups_triggered: todayActivities.filter((a) => a.type === "followup_triggered").length,
        replies_received: todayActivities.filter((a) => a.type === "reply_received").length,
        hot_leads: todayActivities.filter(
          (a) => a.type === "classified" && a.metadata?.classification === "hot"
        ).length,
      });
    } catch (error) {
      console.error("Failed to fetch activities:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (workspaceId) {
      fetchActivities();
    }
  }, [workspaceId, filter]);

  // Real-time subscription
  useEffect(() => {
    if (!workspaceId) return;

    const channel = supabase
      .channel("activity-logs-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "activity_logs",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          const newActivity = payload.new as ActivityLog;
          setActivities((prev) => [newActivity, ...prev].slice(0, 100));

          // Update summary if it's today
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (new Date(newActivity.created_at) >= today) {
            setSummary((prev) => {
              const updates: Partial<SummaryCounts> = {};
              if (newActivity.type === "email_sent") updates.emails_sent = prev.emails_sent + 1;
              if (newActivity.type === "followup_triggered") updates.followups_triggered = prev.followups_triggered + 1;
              if (newActivity.type === "reply_received") updates.replies_received = prev.replies_received + 1;
              if (newActivity.type === "classified" && newActivity.metadata?.classification === "hot") {
                updates.hot_leads = prev.hot_leads + 1;
              }
              return { ...prev, ...updates };
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, supabase]);

  if (!workspaceId) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Activity Log</h2>
          <p className="text-sm text-muted-foreground">
            Real-time feed showing SmartSend is working for you
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as ActivityType | "all")}
              className="pl-10 pr-8 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">All Activities</option>
              <option value="email_sent">Emails Sent</option>
              <option value="followup_triggered">Follow-Ups</option>
              <option value="reply_received">Replies</option>
              <option value="classified">Hot Leads</option>
              <option value="import">Imports</option>
              <option value="campaign_launched">Campaigns</option>
            </select>
          </div>
          <Button variant="outline" size="sm" onClick={fetchActivities} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Counters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Emails Sent Today</p>
                <p className="text-2xl font-bold">{summary.emails_sent}</p>
              </div>
              <Mail className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Follow-Ups Triggered</p>
                <p className="text-2xl font-bold">{summary.followups_triggered}</p>
              </div>
              <RefreshCw className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">New Replies</p>
                <p className="text-2xl font-bold">{summary.replies_received}</p>
              </div>
              <Reply className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Hot Leads Detected</p>
                <p className="text-2xl font-bold">{summary.hot_leads}</p>
              </div>
              <Zap className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity Feed */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && activities.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Loading activities...</div>
          ) : activities.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No activities yet. SmartSend will log activities here as they happen.
            </div>
          ) : (
            <div className="space-y-4">
              {activities.map((activity) => {
                const Icon = ICONS[activity.type];
                return (
                  <div
                    key={activity.id}
                    className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="mt-1">
                      <div className="rounded-full bg-primary/10 p-2">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{TYPE_LABELS[activity.type]}</span>
                        <Badge variant="outline" className="text-xs">
                          {formatTimeAgo(activity.created_at)}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatActivityDescription(activity)}
                      </p>
                    </div>
                    <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

