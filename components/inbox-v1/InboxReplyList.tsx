// Block 19600 — SmartSend Owner Inbox v1
// Reply list component with lead ranking scores

"use client";

type Reply = {
  thread_id: string;
  message_id: string;
  campaign_id: string;
  lead_id: string;
  homeowner_name: string;
  homeowner_email: string;
  subject: string;
  last_message_preview: string;
  last_message_at: string;
  ai_intent_tag: string | null;
  ai_intent_confidence: number | null;
  lead_ranking_score: number | null;
  unread_count: number;
  lead_value_range: string | null;
  follow_up_timer_hours: number | null;
};

interface InboxReplyListProps {
  replies: Reply[];
  loading: boolean;
  selectedThreadId: string | null;
  onSelectThread: (threadId: string) => void;
}

export default function InboxReplyList({
  replies,
  loading,
  selectedThreadId,
  onSelectThread,
}: InboxReplyListProps) {
  const getIntentBadge = (intent: string | null) => {
    if (!intent) return null;
    
    const badges: Record<string, { label: string; color: string }> = {
      hot_lead: { label: "Hot", color: "bg-red-100 text-red-700 border-red-300" },
      warm_lead: { label: "Warm", color: "bg-orange-100 text-orange-700 border-orange-300" },
      cold_lead: { label: "Cold", color: "bg-blue-100 text-blue-700 border-blue-300" },
      dead_lead: { label: "Not Interested", color: "bg-gray-100 text-gray-700 border-gray-300" },
      follow_up_needed: { label: "Follow-Up", color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
    };

    const badge = badges[intent];
    if (!badge) return null;

    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium border ${badge.color}`}>
        {badge.label}
      </span>
    );
  };

  const getScoreColor = (score: number | null) => {
    if (!score) return "text-neutral-400";
    if (score >= 80) return "text-red-600 font-bold";
    if (score >= 60) return "text-orange-600 font-semibold";
    if (score >= 40) return "text-yellow-600";
    return "text-blue-600";
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
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="p-4 text-center text-neutral-400">
        Loading replies...
      </div>
    );
  }

  if (replies.length === 0) {
    return (
      <div className="p-4 text-center text-neutral-400">
        <p className="text-sm">No replies found</p>
        <p className="text-xs mt-1">Replies from homeowners will appear here</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-neutral-200">
      {replies.map((reply) => (
        <button
          key={reply.thread_id}
          onClick={() => onSelectThread(reply.thread_id)}
          className={`w-full p-4 text-left hover:bg-neutral-50 transition-colors ${
            selectedThreadId === reply.thread_id ? "bg-blue-50 border-l-4 border-l-blue-500" : ""
          }`}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-neutral-900 truncate">
                  {reply.homeowner_name || reply.homeowner_email}
                </span>
                {reply.unread_count > 0 && (
                  <span className="bg-blue-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {reply.unread_count}
                  </span>
                )}
              </div>
              {reply.subject && (
                <div className="text-sm text-neutral-600 truncate mb-1">
                  {reply.subject}
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              {reply.lead_ranking_score !== null && (
                <span className={`text-sm font-semibold ${getScoreColor(reply.lead_ranking_score)}`}>
                  {reply.lead_ranking_score}
                </span>
              )}
              {getIntentBadge(reply.ai_intent_tag)}
            </div>
          </div>

          <div className="text-sm text-neutral-500 line-clamp-2 mb-2">
            {reply.last_message_preview}
          </div>

          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span>{formatTimeAgo(reply.last_message_at)}</span>
            {reply.follow_up_timer_hours && (
              <span className="text-yellow-600 font-medium">
                Follow up within {reply.follow_up_timer_hours}h
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}



















































