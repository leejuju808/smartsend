// Block 13500 — Contact Timeline v3
// Unified Activity Feed Component

"use client";

import { useContactActivity } from "@/lib/hooks/useContactActivity";

interface ContactActivityFeedProps {
  contactId: string;
}

export function ContactActivityFeed({ contactId }: ContactActivityFeedProps) {
  const { activity, loading } = useContactActivity(contactId);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-sm text-gray-500">Loading timeline...</div>
      </div>
    );
  }

  if (activity.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-sm text-gray-500">No activity yet</div>
      </div>
    );
  }

  const formatActivityType = (type: string): string => {
    return type
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const getActivityIcon = (type: string): string => {
    switch (type) {
      case "email_sent":
        return "📧";
      case "email_received":
        return "📨";
      case "sms_sent":
        return "💬";
      case "sms_received":
        return "📱";
      case "call_log":
        return "📞";
      case "file_upload":
        return "📎";
      case "task_created":
        return "✅";
      case "task_completed":
        return "✔️";
      case "pipeline_update":
        return "🔄";
      case "note":
        return "📝";
      default:
        return "•";
    }
  };

  return (
    <div className="space-y-4">
      {activity.map((item) => (
        <div
          key={item.id}
          className="p-4 border rounded-xl bg-white shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex justify-between items-start mb-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">{getActivityIcon(item.activity_type)}</span>
              <span className="text-sm font-medium text-gray-800 capitalize">
                {formatActivityType(item.activity_type)}
              </span>
            </div>
            <span className="text-xs text-gray-500">
              {new Date(item.created_at).toLocaleString()}
            </span>
          </div>

          {item.title && (
            <div className="font-semibold text-gray-900 mt-2 mb-1">
              {item.title}
            </div>
          )}

          {item.body && (
            <div className="text-gray-700 mt-2 whitespace-pre-wrap text-sm">
              {item.body}
            </div>
          )}

          {/* Intent label badge */}
          {item.meta?.intent_label && (
            <div className="mt-2">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                  item.meta.intent_label === "hot_lead"
                    ? "bg-red-100 text-red-700"
                    : item.meta.intent_label === "warm_lead"
                    ? "bg-amber-100 text-amber-700"
                    : item.meta.intent_label === "not_interested" ||
                      item.meta.intent_label === "unsubscribe"
                    ? "bg-gray-100 text-gray-700"
                    : item.meta.intent_label === "out_of_office"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                AI: {item.meta.intent_label.replace(/_/g, " ")}
                {item.meta.intent_confidence && (
                  <span className="ml-1 opacity-70">
                    ({Math.round(item.meta.intent_confidence * 100)}%)
                  </span>
                )}
              </span>
            </div>
          )}

          {item.meta && Object.keys(item.meta).length > 0 && (
            <details className="mt-3">
              <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                View details
              </summary>
              <pre className="mt-2 text-xs bg-gray-50 p-3 rounded border overflow-x-auto">
                {JSON.stringify(item.meta, null, 2)}
              </pre>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}

