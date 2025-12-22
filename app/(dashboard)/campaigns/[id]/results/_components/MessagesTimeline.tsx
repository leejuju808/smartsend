"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { createClient } from "@/utils/supabase/client";

interface MessagesTimelineProps {
  campaignId: string;
}

interface MessageEvent {
  step: number;
  sentAt: string;
  recipientCount: number;
  subject?: string;
}

export function MessagesTimeline({ campaignId }: MessagesTimelineProps) {
  const [messages, setMessages] = useState<MessageEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMessages() {
      const supabase = createClient();

      // Get messages from multiple sources
      const { data: sendLogs } = await supabase
        .from("send_logs")
        .select("sent_at, step_no, subject")
        .eq("campaign_id", campaignId)
        .eq("status", "sent")
        .order("sent_at", { ascending: true });

      const { data: emailLogs } = await supabase
        .from("email_logs")
        .select("created_at, step_no, subject")
        .eq("campaign_id", campaignId)
        .eq("event_type", "sent")
        .order("created_at", { ascending: true });

      const { data: outboundEmails } = await supabase
        .from("outbound_emails")
        .select("sent_at, step_no, subject")
        .eq("campaign_id", campaignId)
        .eq("status", "sent")
        .order("sent_at", { ascending: true });

      const { data: emailMessages } = await supabase
        .from("email_messages")
        .select("sent_at, subject")
        .eq("campaign_id", campaignId)
        .eq("direction", "out")
        .order("sent_at", { ascending: true });

      // Combine all messages
      const allMessages: Array<{ sent_at: string; step_no?: number; subject?: string }> = [];
      
      [...(sendLogs || []), ...(emailLogs || []), ...(outboundEmails || []), ...(emailMessages || [])].forEach((msg) => {
        allMessages.push({
          sent_at: msg.sent_at || (msg as any).created_at || new Date().toISOString(),
          step_no: msg.step_no || (msg as any).step_no || 1,
          subject: msg.subject,
        });
      });

      if (allMessages.length > 0) {
        // Group by day and step
        const grouped: Record<string, { count: number; step: number; subject?: string }> = {};
        
        allMessages.forEach((item) => {
          const date = new Date(item.sent_at).toISOString().split("T")[0];
          const step = item.step_no || 1;
          const key = `${date}-${step}`;
          
          if (!grouped[key]) {
            grouped[key] = {
              count: 0,
              step: step,
              subject: item.subject,
            };
          }
          grouped[key].count += 1;
        });

        const messageEvents: MessageEvent[] = Object.entries(grouped)
          .map(([key, data]) => {
            const [date] = key.split("-");
            return {
              step: data.step,
              sentAt: date,
              recipientCount: data.count,
              subject: data.subject,
            };
          })
          .sort((a, b) => {
            const dateCompare = a.sentAt.localeCompare(b.sentAt);
            return dateCompare !== 0 ? dateCompare : a.step - b.step;
          });

        setMessages(messageEvents);
      }

      setLoading(false);
    }

    fetchMessages();
  }, [campaignId]);

  if (loading) {
    return (
      <div>
        <h2 className="text-lg font-semibold mb-4">Messages Sent Timeline</h2>
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">Loading timeline...</p>
        </Card>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div>
        <h2 className="text-lg font-semibold mb-4">Messages Sent Timeline</h2>
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">
            No messages sent yet. Timeline will appear here as SmartSend sends your sequence.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Messages Sent Timeline</h2>
      <Card className="p-6">
        <div className="space-y-4">
          {messages.map((message, index) => (
            <div key={index} className="flex items-start gap-4 pb-4 border-b last:border-0">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                <span className="text-sm font-semibold text-blue-700">
                  {message.step}
                </span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Message {message.step}</span>
                  <span className="text-sm text-muted-foreground">
                    sent to {message.recipientCount.toLocaleString()}{" "}
                    {message.recipientCount === 1 ? "homeowner" : "homeowners"}
                  </span>
                </div>
                {message.subject && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Subject: {message.subject}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(message.sentAt).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

