"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";

type Reply = {
  reply_id: string;
  replied_at: string;
  from_email: string;
  subject: string;
  snippet: string;
  handled_by: string | null;
  status: "active" | "handled";
  updated_at: string;
  lead_id: string;
  lead_email: string;
  first_name: string | null;
  last_name: string | null;
  lead_status: string;
  campaign_id: string | null;
  campaign_name: string | null;
};

type CampaignLog = {
  id: string;
  subject: string;
  sent_at: string;
  direction: "out";
};

export default function ReplyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const replyId = params.id as string;
  
  const [reply, setReply] = useState<Reply | null>(null);
  const [campaignLogs, setCampaignLogs] = useState<CampaignLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Get current user
        const userRes = await fetch("/api/auth/get-user");
        const userData = await userRes.json();
        if (userData.userId) {
          setUserId(userData.userId);
        }

        // Fetch reply with joins
        const replyRes = await fetch(`/api/replies/${replyId}`);
        if (!replyRes.ok) {
          throw new Error("Failed to fetch reply");
        }
        const replyData = await replyRes.json();
        setReply(replyData.reply);
        setCampaignLogs(replyData.campaignLogs || []);
      } catch (error) {
        console.error("Error fetching reply:", error);
      } finally {
        setLoading(false);
      }
    };

    if (replyId) {
      fetchData();
    }
  }, [replyId]);

  const handleMarkHandled = async () => {
    if (!userId || !reply) return;
    
    setMarking(true);
    try {
      const res = await fetch("/api/mark_reply_handled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reply_id: reply.reply_id,
          user_id: userId,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to mark as handled");
      }

      // Update local state
      setReply((prev) => prev ? { ...prev, status: "handled", handled_by: userId } : null);
      
      // Show success (simple alert for now, can be replaced with toast)
      alert("Marked as handled ✅");
      
      // Redirect back to replies list
      router.push("/replies");
    } catch (error) {
      console.error("Error marking reply as handled:", error);
      alert("Failed to mark as handled");
    } finally {
      setMarking(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-muted-foreground">Loading reply...</div>
    );
  }

  if (!reply) {
    return (
      <div className="p-8 text-muted-foreground">Reply not found.</div>
    );
  }

  // Sort messages: outbound first, then reply
  const allMessages = [
    ...campaignLogs.map((log) => ({
      id: log.id,
      type: "outbound" as const,
      subject: log.subject,
      body: "", // Campaign logs don't have body in this schema
      timestamp: log.sent_at,
      from: null,
    })),
    {
      id: reply.reply_id,
      type: "inbound" as const,
      subject: reply.subject,
      body: reply.snippet,
      timestamp: reply.replied_at,
      from: reply.from_email,
    },
  ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-4">
        <button
          onClick={() => router.push("/replies")}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to Replies
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Reply Thread */}
        <div className="md:col-span-2 space-y-4">
          <Card>
            <CardContent className="p-6">
              <div className="mb-4 pb-4 border-b">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-semibold mb-2">
                      {reply.subject || "(No Subject)"}
                    </h2>
                    <div className="text-sm text-muted-foreground">
                      <div>
                        <span className="font-medium">From:</span> {reply.from_email}
                      </div>
                      <div>
                        <span className="font-medium">Lead:</span>{" "}
                        {reply.first_name || reply.last_name
                          ? `${reply.first_name || ""} ${reply.last_name || ""}`.trim()
                          : reply.lead_email}
                      </div>
                      {reply.campaign_name && (
                        <div>
                          <span className="font-medium">Campaign:</span> {reply.campaign_name}
                        </div>
                      )}
                      <div>
                        <span className="font-medium">Received:</span>{" "}
                        {new Date(reply.replied_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {reply.status === "active" ? (
                      <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
                        🟢 Active
                      </span>
                    ) : (
                      <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded">
                        ⚫ Handled
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Email Thread Bubbles */}
              <div className="space-y-4">
                {allMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`p-4 rounded-lg border ${
                      msg.type === "outbound"
                        ? "bg-blue-50 border-blue-200 ml-8"
                        : "bg-white border-gray-200 mr-8"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium">
                        {msg.type === "outbound" ? "You" : msg.from}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(msg.timestamp).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-sm font-medium mb-1">{msg.subject}</div>
                    {msg.body && (
                      <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {msg.body}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Quick Actions */}
        <div className="md:col-span-1">
          <Card>
            <CardContent className="p-6 space-y-4">
              <h3 className="font-semibold mb-4">Quick Actions</h3>

              {/* Mark as Handled */}
              <div className="space-y-2">
                <Button
                  onClick={handleMarkHandled}
                  disabled={marking || reply.status === "handled"}
                  className="w-full"
                  variant={reply.status === "handled" ? "secondary" : "default"}
                >
                  {reply.status === "handled" ? "✅ Marked as Handled" : "Mark as Handled ✅"}
                </Button>
              </div>

              {/* Reassign */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Reassign 👥</label>
                <Button variant="outline" className="w-full" disabled>
                  Reassign (Coming Soon)
                </Button>
              </div>

              {/* Add Note */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Add Note 📝</label>
                <Button variant="outline" className="w-full" disabled>
                  Add Note (Coming Soon)
                </Button>
              </div>

              {/* Reply Info */}
              <div className="pt-4 border-t space-y-2 text-sm">
                <div>
                  <span className="font-medium">Status:</span>{" "}
                  <span className={reply.status === "active" ? "text-green-600" : "text-gray-600"}>
                    {reply.status === "active" ? "Active" : "Handled"}
                  </span>
                </div>
                {reply.handled_by && (
                  <div>
                    <span className="font-medium">Handled by:</span> {reply.handled_by}
                  </div>
                )}
                {reply.updated_at && (
                  <div className="text-xs text-muted-foreground">
                    Updated: {new Date(reply.updated_at).toLocaleString()}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

