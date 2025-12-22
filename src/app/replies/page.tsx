"use client";

import * as React from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

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

export default function RepliesInboxPage() {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("open");

  const { data, isLoading, mutate } = useSWR<{ threads: Thread[] }>(
    `/api/replies/threads?status=${statusFilter}`,
    fetcher,
    { refreshInterval: 10_000 }
  );

  const filteredThreads = React.useMemo(() => {
    if (!data?.threads) return [];
    const needle = query.toLowerCase();
    return data.threads.filter((t) => {
      if (needle) {
        return (
          t.lead_name.toLowerCase().includes(needle) ||
          t.lead_email.toLowerCase().includes(needle) ||
          (t.company_name && t.company_name.toLowerCase().includes(needle)) ||
          (t.campaign_name && t.campaign_name.toLowerCase().includes(needle))
        );
      }
      return true;
    });
  }, [data?.threads, query]);

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Replies Inbox</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setStatusFilter("open")}
            className={`px-3 py-1 rounded text-sm ${
              statusFilter === "open" ? "bg-primary text-primary-foreground" : "bg-muted"
            }`}
          >
            Open
          </button>
          <button
            onClick={() => setStatusFilter("snoozed")}
            className={`px-3 py-1 rounded text-sm ${
              statusFilter === "snoozed" ? "bg-primary text-primary-foreground" : "bg-muted"
            }`}
          >
            Snoozed
          </button>
          <button
            onClick={() => setStatusFilter("archived")}
            className={`px-3 py-1 rounded text-sm ${
              statusFilter === "archived" ? "bg-primary text-primary-foreground" : "bg-muted"
            }`}
          >
            Archived
          </button>
        </div>
      </div>

      <Input
        placeholder="Search by lead name, email, company, or campaign..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-md"
      />

      <div className="grid grid-cols-1 gap-2">
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        )}

        {!isLoading && filteredThreads.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No replies found
          </div>
        )}

        {!isLoading &&
          filteredThreads.map((thread) => (
            <Card
              key={thread.id}
              className="p-4 border rounded bg-white hover:bg-muted cursor-pointer transition"
              onClick={() => router.push(`/replies/${thread.id}`)}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{thread.lead_name}</div>
                  <div className="text-sm text-muted-foreground truncate">
                    {thread.lead_email}
                  </div>
                  {thread.company_name && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {thread.company_name}
                    </div>
                  )}
                  {thread.campaign_name && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Campaign: {thread.campaign_name}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 ml-4">
                  <Badge variant={categoryBadgeVariant(thread.ai_category)}>
                    {thread.ai_category.replace("_", " ")}
                  </Badge>
                  <div className="text-xs text-muted-foreground">
                    {new Date(thread.last_message_at).toLocaleString()}
                  </div>
                </div>
              </div>
            </Card>
          ))}
      </div>
    </div>
  );
}
