// Block 14000 — Lead Card Component
// Shows lead details in pipeline board

"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { ReasonBadge } from "@/components/leads/ReasonBadge";

type Lead = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  company: string | null;
  city: string | null;
  state: string | null;
  tags: string[] | null;
  pipeline_stage: string;
  status?: string;
  lead_score: number;
  lead_score_last_updated: string | null;
  win_reason?: string | null;
  loss_reason?: string | null;
  reason_confidence?: number | null;
  last_message: {
    subject: string | null;
    snippet: string;
    received_at: string;
  } | null;
  estimated_value: number | null;
  last_reply_at: string | null;
  created_at: string;
  updated_at: string;
};

type Props = {
  lead: Lead;
};

export function LeadCard({ lead }: Props) {
  const name =
    lead.first_name || lead.last_name
      ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim()
      : lead.email.split("@")[0];

  const location = [lead.city, lead.state].filter(Boolean).join(", ") || null;

  // Score badge color
  const getScoreColor = (score: number) => {
    if (score >= 70) return "bg-red-100 text-red-700 border-red-300";
    if (score >= 30) return "bg-yellow-100 text-yellow-700 border-yellow-300";
    return "bg-gray-100 text-gray-700 border-gray-300";
  };

  return (
    <Card className="mb-2 hover:shadow-md transition-shadow cursor-pointer">
      <CardContent className="p-3">
        {/* Name & Email */}
        <div className="mb-2">
          <div className="font-semibold text-sm text-gray-900">{name}</div>
          <div className="text-xs text-gray-500 truncate">{lead.email}</div>
        </div>

        {/* Lead Score Badge */}
        <div className="mb-2">
          <Badge
            variant="outline"
            className={`text-xs font-bold ${getScoreColor(lead.lead_score)}`}
          >
            Score: {lead.lead_score}
          </Badge>
        </div>

        {/* Location */}
        {location && (
          <div className="text-xs text-gray-600 mb-2">
            📍 {location}
          </div>
        )}

        {/* Tags */}
        {lead.tags && lead.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {lead.tags.slice(0, 3).map((tag, idx) => (
              <Badge
                key={idx}
                variant="secondary"
                className="text-xs px-1.5 py-0.5"
              >
                {tag}
              </Badge>
            ))}
            {lead.tags.length > 3 && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                +{lead.tags.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* Last Message Preview */}
        {lead.last_message && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="text-xs font-medium text-gray-700 mb-1 truncate">
              {lead.last_message.subject || "No subject"}
            </div>
            <div className="text-xs text-gray-600 line-clamp-2">
              {lead.last_message.snippet}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {formatDistanceToNow(new Date(lead.last_message.received_at), {
                addSuffix: true,
              })}
            </div>
          </div>
        )}

        {/* Estimated Value */}
        {lead.estimated_value && (
          <div className="mt-2 text-xs font-semibold text-green-700">
            💰 ${lead.estimated_value.toLocaleString()}
          </div>
        )}

        {/* Reply Time */}
        {lead.last_reply_at && (
          <div className="mt-1 text-xs text-gray-500">
            Last reply:{" "}
            {formatDistanceToNow(new Date(lead.last_reply_at), {
              addSuffix: true,
            })}
          </div>
        )}

        {/* Win/Loss Reason Badge */}
        {(lead.status === "won" || lead.status === "lost") && (
          <div className="mt-2">
            <ReasonBadge
              reason={lead.status === "won" ? lead.win_reason : lead.loss_reason}
              status={lead.status}
              confidence={lead.reason_confidence}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
