"use client";

import Link from "next/link";
import { MessageSquare, Zap, Shield, Send, ArrowRight, Calendar, CheckSquare } from "lucide-react";

interface ActivityItem {
  id: string;
  type: string;
  description: string;
  contactId?: string;
  contactName?: string;
  createdAt: string;
}

interface RecentActivityProps {
  activities: ActivityItem[];
}

export function RecentActivity({ activities }: RecentActivityProps) {
  const getIcon = (type: string) => {
    switch (type) {
      case "reply_received":
        return <MessageSquare className="h-4 w-4 text-blue-600" />;
      case "score_changed":
        return <Zap className="h-4 w-4 text-orange-600" />;
      case "enrichment_added":
        return <Shield className="h-4 w-4 text-purple-600" />;
      case "email_sent":
        return <Send className="h-4 w-4 text-green-600" />;
      case "pipeline_moved":
        return <ArrowRight className="h-4 w-4 text-gray-600" />;
      case "task_created":
        return <CheckSquare className="h-4 w-4 text-purple-600" />;
      case "campaign_step":
        return <Calendar className="h-4 w-4 text-blue-600" />;
      default:
        return <MessageSquare className="h-4 w-4 text-gray-600" />;
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="rounded-lg border-2 border-gray-200 p-6 bg-white">
      <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
      <div className="space-y-3">
        {activities.length === 0 ? (
          <p className="text-sm text-gray-500">No recent activity</p>
        ) : (
          activities.map((activity) => (
            <div
              key={activity.id}
              className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="mt-0.5">{getIcon(activity.type)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {activity.description}
                </p>
                {activity.contactName && (
                  <Link
                    href={activity.contactId ? `/contacts/${activity.contactId}` : "#"}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {activity.contactName}
                  </Link>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  {formatTimeAgo(activity.createdAt)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
      {activities.length > 0 && (
        <Link
          href="/activity"
          className="block mt-4 text-sm text-blue-600 hover:underline text-center"
        >
          View all activity →
        </Link>
      )}
    </div>
  );
}





















































