"use client";

import React from "react";
import { ActivityLog } from "@/app/activity/page";

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days !== 1 ? "s" : ""} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months !== 1 ? "s" : ""} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years !== 1 ? "s" : ""} ago`;
}

const CATEGORY_LABELS: Record<string, string> = {
  sending: "Sending",
  inbox: "Inbox",
  contact: "Contact",
  campaign: "Campaign",
  task: "Task",
  pipeline: "Pipeline",
  scheduler: "Scheduler",
  deliverability: "Deliverability",
  team: "Team",
  billing: "Billing",
};

const CATEGORY_COLORS: Record<string, string> = {
  sending: "bg-blue-100 text-blue-800",
  inbox: "bg-green-100 text-green-800",
  contact: "bg-purple-100 text-purple-800",
  campaign: "bg-orange-100 text-orange-800",
  task: "bg-yellow-100 text-yellow-800",
  pipeline: "bg-pink-100 text-pink-800",
  scheduler: "bg-indigo-100 text-indigo-800",
  deliverability: "bg-red-100 text-red-800",
  team: "bg-gray-100 text-gray-800",
  billing: "bg-emerald-100 text-emerald-800",
};

function formatEventDescription(log: ActivityLog): string {
  const { category, type, event_type, event_data, contact, campaign, user, revenue_value } = log;

  // Try to build a human-readable description
  let description = "";

  // Use event_data description if available
  if (event_data?.description) {
    return event_data.description;
  }

  // Build description based on type
  switch (type) {
    case "campaign_email_sent":
      description = `Sent email`;
      if (campaign) description += ` from "${campaign.name}"`;
      if (contact) description += ` to ${contact.email}`;
      break;
    case "followup_sent":
      description = `Sent follow-up`;
      if (contact) description += ` to ${contact.email}`;
      break;
    case "new_reply_received":
      description = `Reply received`;
      if (contact) description += ` from ${contact.email}`;
      break;
    case "contact_created":
      description = `Contact created`;
      if (contact) description += `: ${contact.email}`;
      break;
    case "contact_imported":
      description = `Contact imported`;
      if (contact) description += `: ${contact.email}`;
      break;
    case "campaign_created":
      description = `Campaign created`;
      if (campaign) description += `: "${campaign.name}"`;
      break;
    case "campaign_started":
      description = `Campaign started`;
      if (campaign) description += `: "${campaign.name}"`;
      break;
    case "campaign_paused":
      description = `Campaign paused`;
      if (campaign) description += `: "${campaign.name}"`;
      break;
    case "task_created":
      description = `Task created`;
      if (event_data?.title) description += `: ${event_data.title}`;
      break;
    case "task_marked_done":
      description = `Task completed`;
      if (event_data?.title) description += `: ${event_data.title}`;
      break;
    case "moved_to_hot":
      description = `Moved to HOT`;
      if (contact) description += `: ${contact.email}`;
      break;
    case "moved_to_warm":
      description = `Moved to WARM`;
      if (contact) description += `: ${contact.email}`;
      break;
    case "moved_to_cold":
      description = `Moved to COLD`;
      if (contact) description += `: ${contact.email}`;
      break;
    case "appointment_booked":
      description = `Appointment booked`;
      if (contact) description += ` with ${contact.email}`;
      break;
    case "bounce_detected":
      description = `Bounce detected`;
      if (contact) description += ` for ${contact.email}`;
      break;
    case "spam_complaint":
      description = `Spam complaint`;
      if (contact) description += ` from ${contact.email}`;
      break;
    case "user_invited":
      description = `User invited`;
      if (event_data?.email) description += `: ${event_data.email}`;
      break;
    case "plan_upgraded":
      description = `Plan upgraded`;
      break;
    default:
      // Fallback: use event_type or type
      description = event_type || type || "Activity";
      description = description.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  }

  // Add revenue if present
  if (revenue_value) {
    description += ` ($${revenue_value.toLocaleString()})`;
  }

  return description;
}

export function ActivityLogTable({
  logs,
  loading,
  hasMore,
  onLoadMore,
}: {
  logs: ActivityLog[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}) {
  if (loading && logs.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-8 text-center">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-3/4 mx-auto"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto"></div>
        </div>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-8 text-center">
        <p className="text-gray-500">No activity logs found</p>
        <p className="text-sm text-gray-400 mt-2">
          Try adjusting your filters or check back later
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Timestamp
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Category
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Event
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Contact
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Campaign
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                User
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Revenue
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {logs.map((log) => {
              const description = formatEventDescription(log);
              const category = log.category || "unknown";
              const categoryLabel = CATEGORY_LABELS[category] || category;
              const categoryColor = CATEGORY_COLORS[category] || "bg-gray-100 text-gray-800";

              return (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                    <div>{new Date(log.created_at).toLocaleString()}</div>
                    <div className="text-xs text-gray-400">
                      {formatTimeAgo(new Date(log.created_at))}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${categoryColor}`}
                    >
                      {categoryLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {description}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                    {log.contact ? (
                      <div>
                        <div className="font-medium">{log.contact.email}</div>
                        {(log.contact.first_name || log.contact.last_name) && (
                          <div className="text-xs text-gray-400">
                            {[log.contact.first_name, log.contact.last_name]
                              .filter(Boolean)
                              .join(" ")}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                    {log.campaign ? (
                      <span className="font-medium">{log.campaign.name}</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                    {log.user ? (
                      <div>
                        <div>{log.user.name || log.user.email}</div>
                        {log.user.name && (
                          <div className="text-xs text-gray-400">{log.user.email}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">System</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                    {log.revenue_value ? (
                      <span className="font-medium text-green-600">
                        ${log.revenue_value.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="px-4 py-3 bg-gray-50 border-t text-center">
          <button
            onClick={onLoadMore}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Loading..." : "Load More"}
          </button>
        </div>
      )}
    </div>
  );
}

