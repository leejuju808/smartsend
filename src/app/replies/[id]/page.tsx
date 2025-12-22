"use client";

import * as React from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { CommentsPanel } from "@/components/comments/comments-panel";
import { AssignDropdown } from "@/components/team/assign-dropdown";

const fetcher = (url: string) => fetch(url).then((response) => response.json());

type Thread = {
  id: string;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  ai_category: string;
  status: string;
  assigned_to: string | null;
  campaign_id: string | null;
  lead_id: string;
  company_id: string | null;
  lead_name: string;
  lead_email: string;
  company_name: string | null;
  campaign_name: string | null;
};

type Message = {
  id: string;
  created_at: string;
  thread_id: string;
  direction: "inbound" | "outbound";
  body: string;
  raw: any;
};

function categoryBadgeVariant(category: string): "default" | "secondary" | "destructive" | "outline" {
  switch (category) {
    case "interested":
      return "default";
    case "meeting":
      return "default";
    case "not_interested":
      return "destructive";
    case "unsubscribe":
      return "destructive";
    case "bounce":
      return "destructive";
    case "ooo":
      return "outline";
    case "unclear":
      return "secondary";
    default:
      return "secondary";
  }
}

export default function ThreadViewPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { data, isLoading, mutate } = useSWR<{ thread: Thread; messages: Message[] }>(
    `/api/replies/threads/${params.id}`,
    fetcher,
    { refreshInterval: 5_000 }
  );

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <div>Thread not found</div>
      </div>
    );
  }

  const { thread, messages } = data;

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-bold">
            {thread.lead_name} —{" "}
            <Badge variant={categoryBadgeVariant(thread.ai_category)}>
              {thread.ai_category.replace("_", " ")}
            </Badge>
          </h2>
          <div className="text-sm text-muted-foreground">
            {thread.lead_email}
            {thread.company_name && ` • ${thread.company_name}`}
            {thread.campaign_name && ` • ${thread.campaign_name}`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Assign:</label>
          <AssignDropdown
            type="thread"
            id={params.id}
            currentOwnerId={thread.assigned_to}
            onAssign={() => mutate()}
          />
        </div>
      </div>

      <div className="space-y-4">
        {messages.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No messages in this thread
          </div>
        ) : (
          messages.map((message) => (
            <Card
              key={message.id}
              className={`p-3 rounded border bg-white ${
                message.direction === "inbound" ? "border-l-4 border-l-blue-500" : "border-l-4 border-l-green-500"
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="font-medium">
                  {message.direction === "inbound" ? "Lead" : "You"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(message.created_at).toLocaleString()}
                </div>
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm">{message.body}</div>
            </Card>
          ))
        )}
      </div>

      {/* Comments Panel */}
      <div className="mt-6 border-t pt-6">
        <CommentsPanel context="thread" id={params.id} />
      </div>
    </div>
  );
}



