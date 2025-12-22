// Block 14000 — Lead Profile Drawer Component
// Shows full lead details when clicking a card

"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

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
  lead_score: number;
  lead_score_last_updated: string | null;
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
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function LeadProfileDrawer({ lead, open, onOpenChange }: Props) {
  const name =
    lead.first_name || lead.last_name
      ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim()
      : lead.email.split("@")[0];

  const getScoreColor = (score: number) => {
    if (score >= 70) return "bg-red-100 text-red-700 border-red-300";
    if (score >= 30) return "bg-yellow-100 text-yellow-700 border-yellow-300";
    return "bg-gray-100 text-gray-700 border-gray-300";
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{name}</SheetTitle>
          <SheetDescription>{lead.email}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Lead Score */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              Lead Score
            </h3>
            <Badge
              variant="outline"
              className={`text-lg font-bold px-4 py-2 ${getScoreColor(
                lead.lead_score
              )}`}
            >
              {lead.lead_score}
            </Badge>
            {lead.lead_score_last_updated && (
              <p className="text-xs text-gray-500 mt-1">
                Updated{" "}
                {formatDistanceToNow(
                  new Date(lead.lead_score_last_updated),
                  { addSuffix: true }
                )}
              </p>
            )}
          </div>

          {/* Pipeline Stage */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              Pipeline Stage
            </h3>
            <Badge variant="secondary" className="text-sm">
              {lead.pipeline_stage}
            </Badge>
          </div>

          {/* Contact Info */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              Contact Information
            </h3>
            <div className="space-y-1 text-sm">
              {lead.phone && <div>📞 {lead.phone}</div>}
              {lead.company && <div>🏢 {lead.company}</div>}
              {(lead.city || lead.state) && (
                <div>
                  📍 {[lead.city, lead.state].filter(Boolean).join(", ")}
                </div>
              )}
            </div>
          </div>

          {/* Tags */}
          {lead.tags && lead.tags.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Tags
              </h3>
              <div className="flex flex-wrap gap-2">
                {lead.tags.map((tag, idx) => (
                  <Badge key={idx} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Estimated Value */}
          {lead.estimated_value && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Estimated Value
              </h3>
              <div className="text-2xl font-bold text-green-600">
                ${lead.estimated_value.toLocaleString()}
              </div>
            </div>
          )}

          {/* Last Message */}
          {lead.last_message && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Last Message
              </h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="font-medium text-sm mb-1">
                  {lead.last_message.subject || "No subject"}
                </div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap">
                  {lead.last_message.snippet}
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  {formatDistanceToNow(
                    new Date(lead.last_message.received_at),
                    { addSuffix: true }
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              Timeline
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Created</span>
                <span className="text-gray-900">
                  {formatDistanceToNow(new Date(lead.created_at), {
                    addSuffix: true,
                  })}
                </span>
              </div>
              {lead.last_reply_at && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Last Reply</span>
                  <span className="text-gray-900">
                    {formatDistanceToNow(new Date(lead.last_reply_at), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">Last Updated</span>
                <span className="text-gray-900">
                  {formatDistanceToNow(new Date(lead.updated_at), {
                    addSuffix: true,
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}





















































