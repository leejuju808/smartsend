"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface ReviewDraft {
  id: string;
  org_id: string;
  lead_id: string | null;
  channel: string | null;
  draft: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

export default function ReviewQueue() {
  const [drafts, setDrafts] = useState<ReviewDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchDrafts();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchDrafts, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchDrafts = async () => {
    try {
      const res = await fetch("/api/review?status=pending");
      if (!res.ok) {
        throw new Error("Failed to fetch drafts");
      }
      const data = await res.json();
      setDrafts(data.drafts || []);
    } catch (error) {
      console.error("Error fetching review queue:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    setProcessing((prev) => new Set(prev).add(id));
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "approve" }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(`Error: ${error.error}`);
        return;
      }

      // Remove from list and refresh
      setDrafts((prev) => prev.filter((d) => d.id !== id));
      alert("✅ Draft approved and queued for sending!");
    } catch (error) {
      console.error("Error approving draft:", error);
      alert("❌ Error approving draft");
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleReject = async (id: string) => {
    setProcessing((prev) => new Set(prev).add(id));
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "reject" }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(`Error: ${error.error}`);
        return;
      }

      // Remove from list
      setDrafts((prev) => prev.filter((d) => d.id !== id));
      alert("✅ Draft rejected");
    } catch (error) {
      console.error("Error rejecting draft:", error);
      alert("❌ Error rejecting draft");
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <p>Loading review queue...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">📝 AI Draft Review</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Review and approve AI-generated outreach messages before sending
        </p>
      </div>

      {drafts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              No pending drafts to review. All clear! ✨
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {drafts.map((d) => (
            <Card key={d.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-base">
                      Draft #{d.id.slice(0, 8)}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      {d.channel && `Channel: ${d.channel}`}
                      {d.channel && d.lead_id && " • "}
                      {d.lead_id && `Lead: ${d.lead_id.slice(0, 8)}`}
                      {" • "}
                      {new Date(d.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="text-sm whitespace-pre-wrap">{d.draft}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleApprove(d.id)}
                    disabled={processing.has(d.id)}
                    className="flex-1"
                  >
                    {processing.has(d.id) ? "Processing..." : "✅ Approve"}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => handleReject(d.id)}
                    disabled={processing.has(d.id)}
                    className="flex-1"
                  >
                    {processing.has(d.id) ? "Processing..." : "❌ Reject"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Stats */}
      <Card>
        <CardContent className="py-4">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Pending Reviews</span>
            <span className="font-semibold">{drafts.length}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

