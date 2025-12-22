"use client";

import { Sparkles } from "lucide-react";

interface ResurrectionActivityProps {
  item: {
    id: string;
    resurrection_type: string;
    sent_at: string;
    status: string;
    message_body?: string;
  };
}

export function ResurrectionActivity({ item }: ResurrectionActivityProps) {
  const getResurrectionTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      no_reply: "No Reply Follow-Up",
      ghosted: "Ghosted Lead Revival",
      estimate_not_booked: "Estimate Not Booked",
      proposal_unanswered: "Proposal Follow-Up",
      warm_cooled: "Warm Lead Cool-Down",
      seasonal_revival: "Seasonal Revival",
      generic_reengagement: "General Re-engagement",
    };
    return labels[type] || type.replace(/_/g, " ");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "replied":
        return (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
            Replied
          </span>
        );
      case "ignored":
        return (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800">
            Ignored
          </span>
        );
      case "sent":
      default:
        return (
          <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-1 text-xs font-medium text-purple-800">
            Sent
          </span>
        );
    }
  };

  return (
    <div className="border-l-2 border-purple-400 pl-3 my-3">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 text-purple-500">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-purple-300 font-bold text-sm">
              🧟‍♂️ Lead Resurrection Triggered
            </p>
            {getStatusBadge(item.status)}
          </div>
          <p className="text-sm text-gray-300 mt-1">
            SmartSend attempted to revive this lead via:{" "}
            <strong>{getResurrectionTypeLabel(item.resurrection_type)}</strong>
          </p>
          {item.message_body && (
            <p className="text-xs text-gray-400 mt-2 italic border-l-2 border-purple-300 pl-2">
              "{item.message_body}"
            </p>
          )}
          <p className="text-xs text-gray-500 mt-1">
            {new Date(item.sent_at).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}









































