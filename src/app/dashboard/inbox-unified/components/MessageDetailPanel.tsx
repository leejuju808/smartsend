"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, Reply, RefreshCw, Send } from "lucide-react";
import { getIntentColor, getIntentLabel } from "./intentUtils";
import { AIReplySuggestions } from "./AIReplySuggestions";

function formatTimeAgo(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);
  
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return then.toLocaleDateString();
}

type Message = {
  id: string;
  subject: string;
  body: string;
  bodyHtml: string;
  sender: string;
  senderEmail: string;
  intent: string;
  replied: boolean;
  requiresFollowup: boolean;
  createdAt: string;
  readAt: string | null;
  classifiedAt: string | null;
  lead: {
    id: string;
    name: string;
    email: string;
    phone: string;
    status: string;
  } | null;
  campaign: {
    id: string;
    name: string;
  } | null;
};

type ThreadMessage = {
  id: string;
  body: string;
  sender: string;
  direction: string;
  createdAt: string;
};

export function MessageDetailPanel({
  messageId,
  onClose,
}: {
  messageId: string;
  onClose: () => void;
}) {
  const [message, setMessage] = useState<Message | null>(null);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [reclassifying, setReclassifying] = useState(false);

  useEffect(() => {
    loadMessage();
  }, [messageId]);

  async function loadMessage() {
    setLoading(true);
    try {
      const res = await fetch(`/api/inbox/unified/${messageId}`);
      if (res.ok) {
        const data = await res.json();
        setMessage(data.message);
        setThread(data.thread || []);
      }
    } catch (error) {
      console.error("Error loading message:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleReclassify() {
    setReclassifying(true);
    try {
      const res = await fetch(`/api/inbox/unified/${messageId}/classify`, {
        method: "POST",
      });
      if (res.ok) {
        await loadMessage(); // Reload to get updated intent
      }
    } catch (error) {
      console.error("Error reclassifying:", error);
    } finally {
      setReclassifying(false);
    }
  }

  if (loading || !message) {
    return (
      <div className="p-4">
        <div className="text-center text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const intentColor = getIntentColor(message.intent);
  const intentLabel = getIntentLabel(message.intent);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b p-4">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h2 className="text-lg font-semibold mb-2">{message.subject || "(No subject)"}</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={intentColor} variant="outline">
                {intentLabel}
              </Badge>
              {message.replied && (
                <Badge variant="secondary" className="bg-green-100 text-green-800">
                  Replied
                </Badge>
              )}
              {message.requiresFollowup && (
                <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                  Pressure Needed
                </Badge>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Lead Info */}
        {message.lead && (
          <div className="text-sm space-y-1">
            <div>
              <span className="font-medium">From:</span> {message.lead.name} ({message.lead.email})
            </div>
            {message.lead.phone && (
              <div>
                <span className="font-medium">Phone:</span> {message.lead.phone}
              </div>
            )}
            {message.campaign && (
              <div>
                <span className="font-medium">City outreach:</span> {message.campaign.name}
              </div>
            )}
            <div className="text-muted-foreground">
              {formatTimeAgo(message.createdAt)}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-4">
          <Button size="sm" variant="outline" onClick={handleReclassify} disabled={reclassifying}>
            <RefreshCw className={`h-4 w-4 mr-2 ${reclassifying ? "animate-spin" : ""}`} />
            Reclassify Intent
          </Button>
        </div>
      </div>

      {/* Thread */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {thread.map((msg) => (
          <Card key={msg.id} className={msg.direction === "inbound" ? "border-l-4 border-l-primary" : ""}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm">{msg.sender}</span>
                <span className="text-xs text-muted-foreground">
                  {formatTimeAgo(msg.createdAt)}
                </span>
              </div>
              <div className="text-sm whitespace-pre-wrap">{msg.body}</div>
            </CardContent>
          </Card>
        ))}

        {/* Current Message */}
        <Card className="border-l-4 border-l-primary">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-sm">{message.sender}</span>
              <span className="text-xs text-muted-foreground">
                {formatTimeAgo(message.createdAt)}
              </span>
            </div>
            {message.bodyHtml ? (
              <div
                className="text-sm prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: message.bodyHtml }}
              />
            ) : (
              <div className="text-sm whitespace-pre-wrap">{message.body}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI Reply Suggestions */}
      <div className="border-t p-4">
        <AIReplySuggestions messageId={messageId} />
      </div>
    </div>
  );
}


































