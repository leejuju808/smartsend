"use client";

interface ReplyRowProps {
  leadName: string;
  subject: string;
  hasReplied: boolean;
  lastReplyAt: string | null;
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  
  return date.toLocaleDateString();
}

export default function ReplyRow({ 
  leadName, 
  subject, 
  hasReplied, 
  lastReplyAt 
}: ReplyRowProps) {
  const timeAgo = lastReplyAt ? formatTimeAgo(lastReplyAt) : null;

  return (
    <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 truncate">
            {leadName}
          </span>
          {hasReplied && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
              Replied
            </span>
          )}
        </div>
        <p className="text-sm text-gray-600 truncate mt-1">
          {subject}
        </p>
        {lastReplyAt && (
          <p className="text-xs text-gray-400 mt-1">
            {timeAgo}
          </p>
        )}
      </div>
    </div>
  );
}

