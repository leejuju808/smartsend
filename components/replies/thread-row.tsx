"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { IntentBadge } from "@/components/replies/intent-badge";

type Thread = {
  id: string;
  lead_id: string;
  campaign_id: string | null;
  updated_at: string;
  intent_primary?: string | null;
  leads?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    company: string | null;
  } | null;
  campaigns?: {
    id: string;
    name: string | null;
  } | null;
};

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

export function ThreadRow({ thread }: { thread: Thread }) {
  const leadName =
    thread.leads?.first_name && thread.leads?.last_name
      ? `${thread.leads.first_name} ${thread.leads.last_name}`
      : thread.leads?.email || "Unknown Lead";

  return (
    <Link
      href={`/replies/${thread.id}`}
      className="block border-b p-4 hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium truncate">{leadName}</span>
            {thread.intent_primary && (
              <IntentBadge intent={thread.intent_primary} />
            )}
            {thread.campaigns?.name && (
              <Badge variant="outline" className="text-xs">
                {thread.campaigns.name}
              </Badge>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            Updated {formatTimeAgo(thread.updated_at)}
          </div>
        </div>
      </div>
    </Link>
  );
}

