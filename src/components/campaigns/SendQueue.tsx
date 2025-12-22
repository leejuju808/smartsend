"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";

export default function SendQueue({ campaignId }: { campaignId: string }) {
  const [jobs, setJobs] = useState<any[]>([]);
  const [campaign, setCampaign] = useState<any>(null);
  const [stats, setStats] = useState({ queued: 0, sent: 0, failed: 0, recentRate: 0 });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const supabase = createClientComponentClient();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      // Fetch campaign status
      const { data: campaignData } = await supabase
        .from("campaigns")
        .select("id, status, name")
        .eq("id", campaignId)
        .single();
      
      setCampaign(campaignData);

      // Fetch send_queue items
      const { data, error } = await supabase
        .from("send_queue")
        .select(`
          id,
          lead_id,
          status,
          scheduled_at,
          sent_at,
          attempt_count,
          last_error,
          message_id,
          thread_id,
          to_email
        `)
        .eq("campaign_id", campaignId)
        .order("scheduled_at", { ascending: true })
        .limit(100);

      if (error) {
        console.error("Error fetching send queue:", error);
        setJobs([]);
      } else {
        setJobs(data || []);
        
        // Calculate stats
        const queued = (data || []).filter(j => j.status === "queued" || j.status === "throttled").length;
        const sent = (data || []).filter(j => j.status === "sent").length;
        const failed = (data || []).filter(j => j.status === "failed").length;
        
        // Calculate recent rate (sent in last minute)
        const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
        const recentSent = (data || []).filter(j => 
          j.status === "sent" && j.sent_at && j.sent_at >= oneMinuteAgo
        ).length;
        
        setStats({ queued, sent, failed, recentRate: recentSent });
      }
      setLoading(false);
    };

    fetchData();
    // Refresh every 10 seconds
    const interval = setInterval(fetchData, 10000);

    return () => clearInterval(interval);
  }, [campaignId, supabase]);

  const enqueue = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/enqueue`, {
        method: "POST",
      });
      if (res.status === 429) {
        toast.error("Daily send limit reached. Try again after reset.");
        return;
      }
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        const message = typeof payload?.error === "string" ? payload.error : "Enqueue failed";
        throw new Error(message);
      }
      // Refresh data
      const fetchData = async () => {
        const { data } = await supabase
          .from("send_queue")
          .select("*")
          .eq("campaign_id", campaignId)
          .limit(100);
        setJobs(data || []);
      };
      await fetchData();
    } catch (error) {
      console.error("Enqueue error:", error);
      toast.error((error as Error).message || "Failed to enqueue");
    } finally {
      setActionLoading(false);
    }
  };

  const setStatus = async (status: "paused" | "running") => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Status update failed");
      
      // Refresh campaign status
      const { data: campaignData } = await supabase
        .from("campaigns")
        .select("id, status")
        .eq("id", campaignId)
        .single();
      setCampaign(campaignData);
    } catch (error) {
      console.error("Status update error:", error);
      alert("Failed to update status: " + (error as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border p-4">
        <h3 className="font-semibold mb-2">Send Queue</h3>
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    queued: "text-yellow-600",
    throttled: "text-orange-600",
    sending: "text-blue-600",
    sent: "text-green-600",
    failed: "text-red-600",
    paused: "text-gray-600",
  };

  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Send Queue</h3>
        <div className="flex gap-2">
          <Button onClick={enqueue} disabled={actionLoading || loading}>
            Enqueue
          </Button>
          {campaign?.status === "running" ? (
            <Button variant="secondary" onClick={() => setStatus("paused")} disabled={actionLoading || loading}>
              Pause
            </Button>
          ) : (
            <Button onClick={() => setStatus("running")} disabled={actionLoading || loading}>
              Resume
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-4 pb-4 border-b">
        <div>
          <div className="text-xs text-muted-foreground">Queued</div>
          <div className="text-2xl font-semibold">{stats.queued}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Sent</div>
          <div className="text-2xl font-semibold text-green-600">{stats.sent}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Failed</div>
          <div className="text-2xl font-semibold text-red-600">{stats.failed}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Rate (last min)</div>
          <div className="text-2xl font-semibold">{stats.recentRate}/min</div>
        </div>
      </div>

      {/* Queue Table */}
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : jobs.length === 0 ? (
        <div className="text-sm text-muted-foreground">No sends scheduled</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Email</th>
                <th className="text-center py-2">Status</th>
                <th className="text-left py-2">Scheduled</th>
                <th className="text-left py-2">Sent</th>
                <th className="text-center py-2">Attempts</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-b">
                  <td className="py-2">
                    {j.to_email || "N/A"}
                  </td>
                  <td className={`text-center py-2 font-medium ${statusColors[j.status] || ""}`}>
                    {j.status}
                  </td>
                  <td className="py-2">
                    {j.scheduled_at ? new Date(j.scheduled_at).toLocaleTimeString() : "-"}
                  </td>
                  <td className="py-2">
                    {j.sent_at ? new Date(j.sent_at).toLocaleTimeString() : "-"}
                  </td>
                  <td className="text-center py-2">
                    {j.attempt_count || 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      {/* Recent Errors */}
      {jobs.some((j) => j.last_error) && (
        <div className="mt-4 text-xs text-red-600">
          <div className="font-semibold mb-1">Recent Errors:</div>
          {jobs
            .filter((j) => j.last_error && j.status === "failed")
            .slice(0, 3)
            .map((j) => (
              <div key={j.id} className="truncate">
                {j.to_email || j.id}: {j.last_error}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

