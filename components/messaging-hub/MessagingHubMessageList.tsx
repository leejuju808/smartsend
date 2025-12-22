"use client";

import { cn } from "@/lib/utils";
import { Mail, MessageSquare, FileText, AlertCircle, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Message = {
  id: string;
  channel: string;
  direction: "inbound" | "outbound";
  from_address: string;
  to_address: string;
  subject: string | null;
  body_text: string | null;
  status: string;
  ai_intent: string | null;
  ai_priority: string;
  labels: string[];
  needs_follow_up: boolean;
  created_at: string;
  contacts?: {
    id: string;
    name: string;
    email: string;
  };
  leads?: {
    id: string;
    name: string;
    email: string;
    status: string;
  };
  roofing_jobs?: {
    id: string;
    title: string;
    status: string;
  };
};

type MessagingHubMessageListProps = {
  messages: Message[];
  selectedMessageId: string | null;
  onSelectMessage: (messageId: string) => void;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
};

const getChannelIcon = (channel: string) => {
  switch (channel) {
    case "email":
      return <Mail className="w-4 h-4" />;
    case "sms":
      return <MessageSquare className="w-4 h-4" />;
    case "webform":
      return <FileText className="w-4 h-4" />;
    default:
      return <MessageSquare className="w-4 h-4" />;
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case "urgent":
      return "bg-red-100 text-red-700";
    case "high":
      return "bg-orange-100 text-orange-700";
    case "normal":
      return "bg-gray-100 text-gray-700";
    case "low":
      return "bg-blue-100 text-blue-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
};

export function MessagingHubMessageList({
  messages,
  selectedMessageId,
  onSelectMessage,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
}: MessagingHubMessageListProps) {
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-sm text-gray-500">Loading messages...</div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No messages found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-4 border-b">
        <h2 className="font-semibold text-sm text-gray-900">
          Messages ({messages.length})
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="divide-y">
          {messages.map((message) => {
            const contactName =
              message.contacts?.name ||
              message.leads?.name ||
              message.from_address ||
              "Unknown";
            const snippet =
              message.body_text?.substring(0, 100) ||
              message.subject ||
              "No content";
            const isSelected = selectedMessageId === message.id;
            const isInbound = message.direction === "inbound";
            const hasLabels = message.labels && message.labels.length > 0;

            return (
              <button
                key={message.id}
                onClick={() => onSelectMessage(message.id)}
                className={cn(
                  "w-full text-left p-4 hover:bg-gray-50 transition-colors",
                  isSelected && "bg-blue-50 border-l-4 border-l-blue-500"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    {getChannelIcon(message.channel)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={cn(
                          "font-medium text-sm",
                          isSelected ? "text-blue-900" : "text-gray-900"
                        )}
                      >
                        {contactName}
                      </span>
                      {isInbound && (
                        <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">
                          Inbound
                        </span>
                      )}
                      {message.ai_priority !== "normal" && (
                        <span
                          className={cn(
                            "text-xs px-1.5 py-0.5 rounded",
                            getPriorityColor(message.ai_priority)
                          )}
                        >
                          {message.ai_priority}
                        </span>
                      )}
                    </div>

                    {message.subject && (
                      <div className="text-sm font-medium text-gray-900 mb-1">
                        {message.subject}
                      </div>
                    )}

                    <div className="text-sm text-gray-600 line-clamp-2 mb-2">
                      {snippet}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-500">
                        {formatDistanceToNow(new Date(message.created_at), {
                          addSuffix: true,
                        })}
                      </span>
                      {hasLabels && (
                        <div className="flex gap-1 flex-wrap">
                          {message.labels.slice(0, 3).map((label) => (
                            <span
                              key={label}
                              className="text-xs px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded"
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      )}
                      {message.needs_follow_up && (
                        <Clock className="w-3 h-3 text-orange-500" />
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {hasMore && (
          <div className="p-4 text-center">
            <button
              onClick={onLoadMore}
              disabled={loadingMore}
              className="text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
            >
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}






































