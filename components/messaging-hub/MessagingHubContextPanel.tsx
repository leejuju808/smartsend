"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  Building2,
  DollarSign,
  Calendar,
  TrendingUp,
  AlertCircle,
  Clock,
  User,
  Mail,
  Phone,
  MapPin,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Message = {
  id: string;
  channel: string;
  direction: "inbound" | "outbound";
  from_address: string;
  to_address: string;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  status: string;
  ai_intent: string | null;
  ai_priority: string;
  labels: string[];
  needs_follow_up: boolean;
  assigned_to: string | null;
  routed_to_role: string | null;
  created_at: string;
  contacts?: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
  };
  leads?: {
    id: string;
    name: string;
    email: string;
    status: string;
    estimated_job_value: number | null;
    address: string | null;
    city: string | null;
    state: string | null;
  };
  roofing_jobs?: {
    id: string;
    title: string;
    status: string;
    job_value: number | null;
    current_stage: string;
    scheduled_start_date: string | null;
    deposit_paid: number | null;
    balance_remaining: number | null;
  };
  internal_comments?: Array<{
    id: string;
    body: string;
    created_at: string;
    created_by_user?: {
      id: string;
      email: string;
      full_name: string | null;
    };
  }>;
  ai_suggestions?: Array<{
    id: string;
    suggestion_type: string;
    suggested_text: string;
    suggested_subject: string | null;
  }>;
};

type MessagingHubContextPanelProps = {
  message: Message;
};

export function MessagingHubContextPanel({
  message,
}: MessagingHubContextPanelProps) {
  const [comments, setComments] = useState(message.internal_comments || []);
  const [suggestions, setSuggestions] = useState(message.ai_suggestions || []);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Load AI suggestions if not already loaded
  useEffect(() => {
    if (suggestions.length === 0 && message.direction === "inbound") {
      loadAISuggestions();
    }
  }, [message.id]);

  const loadAISuggestions = async () => {
    setLoadingSuggestions(true);
    try {
      const res = await fetch("/api/messaging-hub/ai-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message_id: message.id,
          suggestion_types: ["short_reply", "scheduling", "tone_matched"],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions || []);
      }
    } catch (error) {
      console.error("Failed to load AI suggestions:", error);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const contactName =
    message.contacts?.name || message.leads?.name || message.from_address;
  const job = message.roofing_jobs;
  const lead = message.leads;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b">
        <h2 className="font-semibold text-lg text-gray-900">{contactName}</h2>
        {message.subject && (
          <p className="text-sm text-gray-600 mt-1">{message.subject}</p>
        )}
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Job Info */}
        {job && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              Job Info
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Status:</span>
                <span className="font-medium">{job.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Stage:</span>
                <span className="font-medium">{job.current_stage}</span>
              </div>
              {job.job_value && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Job Value:</span>
                  <span className="font-medium">
                    ${job.job_value.toLocaleString()}
                  </span>
                </div>
              )}
              {job.scheduled_start_date && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Scheduled:</span>
                  <span className="font-medium">
                    {new Date(job.scheduled_start_date).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Financial Status */}
        {(job || lead) && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
              <DollarSign className="w-3 h-3" />
              Financial Status
            </h3>
            <div className="space-y-2 text-sm">
              {job?.deposit_paid !== null && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Deposit Paid:</span>
                  <span className="font-medium">
                    ${job.deposit_paid.toLocaleString()}
                  </span>
                </div>
              )}
              {job?.balance_remaining !== null && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Balance:</span>
                  <span className="font-medium">
                    ${job.balance_remaining.toLocaleString()}
                  </span>
                </div>
              )}
              {lead?.estimated_job_value && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Estimated Value:</span>
                  <span className="font-medium">
                    ${lead.estimated_job_value.toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Contact Info */}
        {(message.contacts || message.leads) && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
              <User className="w-3 h-3" />
              Contact Info
            </h3>
            <div className="space-y-2 text-sm">
              {(message.contacts?.email || message.leads?.email) && (
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <span>{message.contacts?.email || message.leads?.email}</span>
                </div>
              )}
              {message.contacts?.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span>{message.contacts.phone}</span>
                </div>
              )}
              {lead?.address && (
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                  <div>
                    <div>{lead.address}</div>
                    {(lead.city || lead.state) && (
                      <div className="text-gray-500 text-xs">
                        {[lead.city, lead.state].filter(Boolean).join(", ")}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* AI Suggestions */}
        {suggestions.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              AI Suggestions
            </h3>
            <div className="space-y-2">
              {suggestions.map((suggestion) => (
                <div
                  key={suggestion.id}
                  className="p-3 bg-blue-50 rounded-md border border-blue-200"
                >
                  <div className="text-xs font-medium text-blue-900 mb-1">
                    {suggestion.suggestion_type.replace("_", " ")}
                  </div>
                  <div className="text-sm text-blue-800">
                    {suggestion.suggested_text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Internal Comments */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Internal Comments
          </h3>
          <div className="space-y-2">
            {comments.map((comment) => (
              <div
                key={comment.id}
                className="p-2 bg-gray-50 rounded-md border border-gray-200"
              >
                <div className="text-xs text-gray-500 mb-1">
                  {comment.created_by_user?.full_name ||
                    comment.created_by_user?.email ||
                    "Unknown"}{" "}
                  • {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                </div>
                <div className="text-sm text-gray-700">{comment.body}</div>
              </div>
            ))}
            {comments.length === 0 && (
              <div className="text-sm text-gray-500 italic">
                No internal comments yet
              </div>
            )}
          </div>
        </div>

        {/* Message Metadata */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">
            Details
          </h3>
          <div className="space-y-1 text-sm text-gray-600">
            <div>Channel: {message.channel}</div>
            <div>Direction: {message.direction}</div>
            <div>
              Received: {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
            </div>
            {message.ai_intent && <div>Intent: {message.ai_intent}</div>}
            {message.routed_to_role && (
              <div>Routed to: {message.routed_to_role}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}






































