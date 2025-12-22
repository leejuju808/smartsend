"use client";

import { useState, useMemo } from "react";
import { 
  Mail, 
  Eye, 
  MousePointerClick, 
  MessageSquare, 
  FileText, 
  CheckSquare, 
  Briefcase, 
  User, 
  Sparkles,
  Calendar,
  Search
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

interface LeadActivity {
  id: string;
  workspace_id: string;
  lead_id: string;
  type: string;
  title: string | null;
  body: string | null;
  metadata: Record<string, any>;
  occurred_at: string;
  created_at: string;
}

interface LeadActivityTimelineProps {
  activities: LeadActivity[];
  leadId: string;
}

type FilterType = "all" | "emails" | "deals" | "notes_tasks" | "system";

const EMAIL_TYPES = ["email_sent", "email_open", "email_click", "reply"];
const DEAL_TYPES = ["deal_created", "deal_stage_changed", "deal_won", "deal_lost"];
const NOTES_TASKS_TYPES = ["note_added", "task_created", "task_completed"];
const SYSTEM_TYPES = ["owner_changed", "enrichment_run", "manual"];

export function LeadActivityTimeline({ activities, leadId }: LeadActivityTimelineProps) {
  const [filter, setFilter] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredActivities = useMemo(() => {
    let filtered = activities;

    // Apply type filter
    if (filter === "emails") {
      filtered = filtered.filter((a) => EMAIL_TYPES.includes(a.type));
    } else if (filter === "deals") {
      filtered = filtered.filter((a) => DEAL_TYPES.includes(a.type));
    } else if (filter === "notes_tasks") {
      filtered = filtered.filter((a) => NOTES_TASKS_TYPES.includes(a.type));
    } else if (filter === "system") {
      filtered = filtered.filter((a) => SYSTEM_TYPES.includes(a.type));
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.title?.toLowerCase().includes(query) ||
          a.body?.toLowerCase().includes(query) ||
          a.type.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [activities, filter, searchQuery]);

  function getActivityIcon(type: string) {
    switch (type) {
      case "email_sent":
        return <Mail className="h-4 w-4 text-blue-500" />;
      case "email_open":
        return <Eye className="h-4 w-4 text-green-500" />;
      case "email_click":
        return <MousePointerClick className="h-4 w-4 text-purple-500" />;
      case "reply":
        return <MessageSquare className="h-4 w-4 text-orange-500" />;
      case "note_added":
        return <FileText className="h-4 w-4 text-gray-500" />;
      case "task_created":
      case "task_completed":
        return <CheckSquare className="h-4 w-4 text-indigo-500" />;
      case "deal_created":
      case "deal_stage_changed":
      case "deal_won":
      case "deal_lost":
        return <Briefcase className="h-4 w-4 text-emerald-500" />;
      case "owner_changed":
        return <User className="h-4 w-4 text-cyan-500" />;
      case "enrichment_run":
        return <Sparkles className="h-4 w-4 text-yellow-500" />;
      case "manual":
        return <Calendar className="h-4 w-4 text-slate-500" />;
      default:
        return <Calendar className="h-4 w-4" />;
    }
  }

  function formatActivityTitle(activity: LeadActivity): string {
    if (activity.title) return activity.title;

    switch (activity.type) {
      case "email_sent":
        const campaignName = activity.metadata?.campaign_id
          ? `via Campaign ${activity.metadata.campaign_id.slice(0, 8)}`
          : "";
        return `✉️ Email sent ${campaignName}`;
      case "email_open":
        return "👀 Email opened";
      case "email_click":
        const url = activity.metadata?.url;
        return url ? `🖱️ Link clicked: ${url}` : "🖱️ Link clicked";
      case "reply":
        const intent = activity.metadata?.intent_primary;
        return intent ? `💬 Reply (${intent})` : "💬 Reply from lead";
      case "deal_created":
        return "💼 Deal created";
      case "deal_stage_changed":
        return `💼 Deal stage changed: ${activity.metadata?.old_stage || "?"} → ${activity.metadata?.stage || "?"}`;
      case "deal_won":
        return "🎉 Deal won";
      case "deal_lost":
        return "❌ Deal lost";
      case "note_added":
        return "📝 Note added";
      case "task_created":
        return "✅ Task created";
      case "task_completed":
        return "✅ Task completed";
      case "owner_changed":
        return "👤 Owner changed";
      case "enrichment_run":
        return "✨ Enrichment run";
      case "manual":
        return "📅 Manual activity";
      default:
        return activity.type.replace(/_/g, " ");
    }
  }

  function formatActivityBody(activity: LeadActivity): string | null {
    if (activity.body) return activity.body;

    switch (activity.type) {
      case "email_sent":
        return activity.metadata?.subject || null;
      case "reply":
        return activity.metadata?.intent_primary
          ? `Intent: ${activity.metadata.intent_primary}`
          : null;
      case "deal_created":
      case "deal_stage_changed":
        const value = activity.metadata?.value;
        const stage = activity.metadata?.stage;
        const parts: string[] = [];
        if (stage) parts.push(`Stage: ${stage}`);
        if (value) parts.push(`Value: $${value.toLocaleString()}`);
        return parts.length > 0 ? parts.join(" • ") : null;
      default:
        return null;
    }
  }

  if (!activities || activities.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <p>No activity yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("all")}
          >
            All
          </Button>
          <Button
            variant={filter === "emails" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("emails")}
          >
            Emails
          </Button>
          <Button
            variant={filter === "deals" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("deals")}
          >
            Deals
          </Button>
          <Button
            variant={filter === "notes_tasks" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("notes_tasks")}
          >
            Notes & Tasks
          </Button>
          <Button
            variant={filter === "system" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("system")}
          >
            System
          </Button>
        </div>

        <div className="relative w-full sm:w-auto sm:min-w-[200px]">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search activities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-3">
        {filteredActivities.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">
            <p>No activities match your filters</p>
          </div>
        ) : (
          filteredActivities.map((activity, index) => {
            const timeAgo = formatDistanceToNow(new Date(activity.occurred_at), {
              addSuffix: true,
            });
            const body = formatActivityBody(activity);

            return (
              <div
                key={activity.id}
                className="relative flex gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                {/* Timeline line */}
                {index < filteredActivities.length - 1 && (
                  <div className="absolute left-6 top-12 bottom-0 w-0.5 bg-border" />
                )}

                {/* Icon */}
                <div className="relative z-10 mt-0.5 flex-shrink-0">
                  <div className="rounded-full bg-background border-2 border-background p-1">
                    {getActivityIcon(activity.type)}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-sm">{formatActivityTitle(activity)}</h3>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {timeAgo}
                    </span>
                  </div>
                  {body && (
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                      {body}
                    </p>
                  )}
                  {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {activity.metadata.thread_id && (
                        <a
                          href={`/threads/${activity.metadata.thread_id}`}
                          className="text-xs text-primary hover:underline"
                        >
                          View Thread
                        </a>
                      )}
                      {activity.metadata.deal_id && (
                        <a
                          href={`/deals/${activity.metadata.deal_id}`}
                          className="text-xs text-primary hover:underline"
                        >
                          View Deal
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}








