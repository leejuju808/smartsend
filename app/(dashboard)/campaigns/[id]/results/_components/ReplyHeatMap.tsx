"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { createClient } from "@/utils/supabase/client";

interface ReplyHeatMapProps {
  campaignId: string;
}

interface ReplyData {
  date: string;
  count: number;
}

export function ReplyHeatMap({ campaignId }: ReplyHeatMapProps) {
  const [replyData, setReplyData] = useState<ReplyData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchReplyData() {
      const supabase = createClient();
      
      // Get replies from multiple sources
      const { data: inboundReplies } = await supabase
        .from("inbound_messages")
        .select("created_at")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: true });

      const { data: emailReplies } = await supabase
        .from("email_replies")
        .select("created_at, processed_at")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: true });

      const { data: emailMessages } = await supabase
        .from("email_messages")
        .select("sent_at, created_at")
        .eq("campaign_id", campaignId)
        .eq("direction", "in")
        .order("sent_at", { ascending: true });

      // Combine all reply timestamps
      const replyDates: string[] = [];
      
      [...(inboundReplies || []), ...(emailReplies || []), ...(emailMessages || [])].forEach((reply) => {
        const date = new Date(
          reply.created_at || 
          (reply as any).sent_at || 
          (reply as any).processed_at || 
          new Date()
        ).toISOString().split("T")[0];
        replyDates.push(date);
      });

      // Group by date
      const grouped: Record<string, number> = {};
      replyDates.forEach((date) => {
        grouped[date] = (grouped[date] || 0) + 1;
      });

      const data = Object.entries(grouped)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      setReplyData(data);
      setLoading(false);
    }

    fetchReplyData();
  }, [campaignId]);

  if (loading) {
    return (
      <div>
        <h2 className="text-lg font-semibold mb-4">Reply Heat Map</h2>
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </Card>
      </div>
    );
  }

  if (replyData.length === 0) {
    return (
      <div>
        <h2 className="text-lg font-semibold mb-4">Reply Heat Map</h2>
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">
            No reply data available yet. Replies will appear here as they come in.
          </p>
        </Card>
      </div>
    );
  }

  const maxCount = Math.max(...replyData.map((d) => d.count));

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Reply Heat Map</h2>
      <Card className="p-6">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground mb-4">
            Reply activity over time (darker = more replies)
          </p>
          <div className="flex flex-wrap gap-2">
            {replyData.map((item) => {
              const intensity = maxCount > 0 ? item.count / maxCount : 0;
              const opacity = Math.max(0.3, intensity);
              
              return (
                <div
                  key={item.date}
                  className="flex flex-col items-center gap-1"
                >
                  <div
                    className="w-8 h-8 rounded border-2 border-blue-200"
                    style={{
                      backgroundColor: `rgba(59, 130, 246, ${opacity})`,
                    }}
                    title={`${item.date}: ${item.count} ${item.count === 1 ? "reply" : "replies"}`}
                  />
                  <span className="text-xs text-muted-foreground">
                    {new Date(item.date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
}

