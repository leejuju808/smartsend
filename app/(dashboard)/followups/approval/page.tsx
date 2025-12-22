// app/(dashboard)/followups/approval/page.tsx
// Block 186: Approval UI for auto-generated follow-ups

"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { toast } from "sonner";

interface FollowUpItem {
  id: string;
  campaign_id: string;
  lead_id: string;
  payload: {
    subject: string;
    body: string;
    auto_followup?: boolean;
    thread_id?: string;
  };
  created_at: string;
  campaigns?: { name: string };
  leads?: { name: string; email: string };
}

export default function FollowUpApprovalPage() {
  const supabase = createClientComponentClient();
  const [queue, setQueue] = useState<FollowUpItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadQueue();
  }, []);

  async function loadQueue() {
    try {
      const res = await fetch("/api/followups/approval");
      if (!res.ok) throw new Error("Failed to load follow-ups");
      const data = await res.json();
      setQueue(data.items || []);
    } catch (error) {
      console.error("Error loading follow-ups:", error);
      toast.error("Failed to load follow-ups");
    } finally {
      setLoading(false);
    }
  }

  async function approve(itemId: string) {
    try {
      const res = await fetch("/api/followups/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId: itemId, action: "approve" }),
      });

      if (!res.ok) throw new Error("Failed to approve");
      
      toast.success("Follow-up approved and queued for sending");
      loadQueue(); // Reload list
    } catch (error) {
      console.error("Error approving:", error);
      toast.error("Failed to approve follow-up");
    }
  }

  async function reject(itemId: string) {
    try {
      const res = await fetch("/api/followups/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId: itemId, action: "reject" }),
      });

      if (!res.ok) throw new Error("Failed to reject");
      
      toast.success("Follow-up rejected");
      loadQueue(); // Reload list
    } catch (error) {
      console.error("Error rejecting:", error);
      toast.error("Failed to reject follow-up");
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <p>Loading follow-ups...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Follow-Up Approval</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review and approve AI-generated follow-up emails
        </p>
      </div>

      {queue.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No follow-ups awaiting approval
          </CardContent>
        </Card>
      ) : (
        queue.map((item) => (
          <Card key={item.id} className="border">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">{item.payload.subject}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {item.leads?.name || item.leads?.email || "Unknown Lead"} •{" "}
                    {item.campaigns?.name || "Unknown Campaign"}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div
                className="text-sm mt-2 whitespace-pre-wrap prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: item.payload.body }}
              />
              <div className="flex gap-2 mt-4">
                <Button onClick={() => approve(item.id)} variant="default">
                  Approve
                </Button>
                <Button
                  onClick={() => reject(item.id)}
                  variant="outline"
                >
                  Reject
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

