// Block 16600 — SmartSend Activity Log v2
// Activity Feed Component

"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ActivityDetailDrawer } from "./ActivityDetailDrawer";
import { ActivityFilters } from "./ActivityFilters";

export interface ActivityLog {
  id: string;
  created_at: string;
  category: string;
  type: string;
  severity: "urgent" | "important" | "info" | "success";
  summary: string;
  details: any;
  source: "ai" | "user" | "system";
  pipeline_stage_key?: string;
  contact?: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
  };
  user?: {
    id: string;
    email: string;
    raw_user_meta_data?: any;
  };
  isGrouped?: boolean;
  groupCount?: number;
  groupItems?: ActivityLog[];
}

interface ActivityFeedProps {
  logs: ActivityLog[];
  loading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
  contactId?: string;
}

export function ActivityFeed({
  logs,
  loading,
  onLoadMore,
  hasMore,
  contactId,
}: ActivityFeedProps) {
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);
  const [filters, setFilters] = useState({
    category: "",
    type: "",
    severity: "",
  });

  const getCategoryIcon = (category: string): string => {
    const icons: Record<string, string> = {
      messaging: "📩",
      pipeline: "🔄",
      scheduler: "📅",
      task: "✅",
      storm: "⛈️",
      insurance: "🛡️",
      revenue: "💰",
      contact_intelligence: "🧠",
      user_action: "👤",
    };
    return icons[category] || "•";
  };

  const getSeverityColor = (severity: string): string => {
    const colors: Record<string, string> = {
      urgent: "border-l-red-500 bg-red-50",
      important: "border-l-yellow-500 bg-yellow-50",
      info: "border-l-blue-500 bg-blue-50",
      success: "border-l-green-500 bg-green-50",
    };
    return colors[severity] || "border-l-gray-500 bg-gray-50";
  };

  const getTypeLabel = (category: string, type: string): string => {
    const labels: Record<string, Record<string, string>> = {
      messaging: {
        email_sent: "Email Sent",
        reply_received: "Reply Received",
        followup_sent: "Follow-up Sent",
        open_tracked: "Email Opened",
        link_click: "Link Clicked",
        bounce: "Email Bounced",
        spam_warning: "Spam Warning",
      },
      pipeline: {
        moved_to_warm: "Moved to Warm",
        moved_to_hot: "Moved to Hot",
        moved_to_appointment: "Moved to Appointment",
        moved_to_insurance: "Moved to Insurance",
        moved_to_quote_sent: "Moved to Quote Sent",
        moved_to_requote: "Moved to Re-Quote",
        moved_to_not_interested: "Moved to Not Interested",
        auto_pipeline_movement: "Auto Pipeline Movement",
      },
      scheduler: {
        appointment_booked: "Appointment Booked",
        appointment_confirmed: "Appointment Confirmed",
        reminder_sent: "Reminder Sent",
        no_show: "No Show",
        rebooking_attempt: "Rebooking Attempt",
        cancellation: "Cancellation",
      },
      task: {
        task_created: "Task Created",
        task_completed: "Task Completed",
        task_overdue: "Task Overdue",
        task_reassigned: "Task Reassigned",
        followup_cycle_triggered: "Follow-up Cycle Triggered",
      },
      storm: {
        hail_detection: "Hail Detected",
        wind_burst_detection: "Wind Burst Detected",
        heavy_rain_notification: "Heavy Rain Notification",
        impacted_zips_updated: "Impacted ZIPs Updated",
        contact_storm_risk_updated: "Storm Risk Updated",
        storm_campaign_suggested: "Storm Campaign Suggested",
      },
      insurance: {
        adjuster_mentioned: "Adjuster Mentioned",
        claim_filed: "Claim Filed",
        deductible_mentioned: "Deductible Mentioned",
        acv_rcv_identified: "ACV/RCV Identified",
        moved_to_insurance_opportunity: "Moved to Insurance Opportunity",
        insurance_templates_triggered: "Insurance Templates Triggered",
      },
      revenue: {
        quote_added: "Quote Added",
        quote_updated: "Quote Updated",
        job_estimate_recalculated: "Job Estimate Recalculated",
        revenue_forecast_updated: "Revenue Forecast Updated",
      },
      contact_intelligence: {
        personalization_updated: "Personalization Updated",
        enrichment_updated: "Enrichment Updated",
        list_intelligence_updated: "List Intelligence Updated",
        lead_heat_score_updated: "Lead Heat Score Updated",
        tone_emotion_detected: "Tone/Emotion Detected",
      },
      user_action: {
        user_created_lead: "Lead Created",
        user_updated_lead_info: "Lead Info Updated",
        user_added_notes: "Note Added",
        user_uploaded_files: "File Uploaded",
        user_changed_pipeline: "Pipeline Changed",
        user_modified_tasks: "Task Modified",
        user_triggered_campaign: "Campaign Triggered",
      },
    };
    return labels[category]?.[type] || type.replace(/_/g, " ");
  };

  const formatTime = (dateString: string): string => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return dateString;
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (filters.category && log.category !== filters.category) return false;
    if (filters.type && log.type !== filters.type) return false;
    if (filters.severity && log.severity !== filters.severity) return false;
    return true;
  });

  if (loading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-sm text-gray-500">Loading activity...</div>
      </div>
    );
  }

  if (filteredLogs.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-sm text-gray-500">No activity found</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!contactId && (
        <ActivityFilters filters={filters} onFiltersChange={setFilters} />
      )}

      {filteredLogs.map((log) => (
        <div
          key={log.id}
          className={`
            p-4 border-l-4 rounded-r-lg shadow-sm hover:shadow-md transition-all cursor-pointer
            ${getSeverityColor(log.severity)}
          `}
          onClick={() => setSelectedLog(log)}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1">
              <span className="text-xl mt-0.5">
                {getCategoryIcon(log.category)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900">
                    {log.isGrouped
                      ? log.summary
                      : getTypeLabel(log.category, log.type)}
                  </span>
                  {log.isGrouped && (
                    <span className="text-xs px-2 py-0.5 bg-gray-200 rounded-full">
                      {log.groupCount} events
                    </span>
                  )}
                  {log.source === "ai" && (
                    <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">
                      AI
                    </span>
                  )}
                </div>

                <p className="text-sm text-gray-700 mt-1">{log.summary}</p>

                {log.contact && !contactId && (
                  <div className="text-xs text-gray-500 mt-1">
                    {log.contact.first_name || log.contact.last_name
                      ? `${log.contact.first_name || ""} ${log.contact.last_name || ""}`.trim()
                      : log.contact.email}
                  </div>
                )}

                {log.pipeline_stage_key && (
                  <div className="text-xs text-gray-500 mt-1">
                    Pipeline: {log.pipeline_stage_key.replace(/_/g, " ")}
                  </div>
                )}

                <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                  <span>{formatTime(log.created_at)}</span>
                  {log.user && (
                    <>
                      <span>•</span>
                      <span>{log.user.email}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}

      {hasMore && onLoadMore && (
        <div className="flex justify-center pt-4">
          <button
            onClick={onLoadMore}
            className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Load More
          </button>
        </div>
      )}

      {selectedLog && (
        <ActivityDetailDrawer
          log={selectedLog}
          open={!!selectedLog}
          onOpenChange={(open) => !open && setSelectedLog(null)}
        />
      )}
    </div>
  );
}





















































