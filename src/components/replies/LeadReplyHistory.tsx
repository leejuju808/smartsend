"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { MessageSquare } from "lucide-react";

type ReplyThread = {
  id: string;
  created_at: string;
  last_message_at: string;
  ai_category: string;
  status: string;
  campaign_name: string | null;
};

export default function LeadReplyHistory({ leadId }: { leadId: string }) {
  const [threads, setThreads] = useState<ReplyThread[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch(`/api/replies/threads?lead_id=${leadId}`);
        const j = await r.json();
        setThreads(j.threads || []);
      } catch (e) {
        console.error("Failed to load reply history:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [leadId]);

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Replies
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading...</div>
        ) : threads.length === 0 ? (
          <div className="text-sm text-muted-foreground">No replies yet.</div>
        ) : (
          <div className="space-y-3">
            {threads.map((thread) => (
              <div
                key={thread.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={categoryBadgeVariant(thread.ai_category)}>
                      {thread.ai_category.replace("_", " ")}
                    </Badge>
                    {thread.campaign_name && (
                      <span className="text-xs text-muted-foreground">
                        {thread.campaign_name}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(thread.last_message_at).toLocaleString()}
                  </div>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/replies/${thread.id}`}>View</Link>
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}












