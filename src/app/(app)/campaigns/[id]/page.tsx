"use client";

import useSWR from "swr";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { fetchCampaignReplies } from "@/lib/queries/replies";
import ShareModal from "@/components/campaigns/ShareModal";
import { ShareDialog } from "@/components/campaigns/ShareDialog";
import LaunchButton from "@/components/campaigns/LaunchButton";
import { InboxList } from "@/components/inbox/InboxList";
import { PreflightPanel } from "@/components/campaigns/PreflightPanel";
import { StepsEditor } from "@/components/campaigns/StepsEditor";
import { StepMetrics } from "@/components/campaigns/StepMetrics";
import { SmartWindowsCard } from "@/components/campaigns/SmartWindowsCard";
import { RotationSummary } from "@/components/campaigns/RotationSummary";

const fetcher = (u: string) => fetch(u).then(r => r.json());

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold">{value}</span>
    </div>
  );
}

export default function CampaignDetail({ params }: { params: { id: string } }) {
  const { id } = params;
  const { data, mutate } = useSWR(`/api/campaigns/${id}`, fetcher, { refreshInterval: 15000 });
  const [retrying, setRetrying] = useState(false);
  const [replyCounts, setReplyCounts] = useState<{ replied_count: number; total: number } | null>(null);
  const router = useRouter();

  // Load reply counts
  useEffect(() => {
    fetchCampaignReplies(id).then(setReplyCounts).catch(console.error);
  }, [id]);

  if (!data) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!data.ok) return <div className="p-6 text-red-600">{data.error || "Failed to load"}</div>;

  const f = data.funnel || {};
  const sent = f.sent ?? 0;
  const delivered = f.delivered ?? 0;
  const bounced = f.bounced ?? 0;
  const total = f.total_enqueued ?? 0;
  const opens = f.opens ?? 0;
  const clicks = f.clicks ?? 0;

  const deliverRate = total ? ((delivered / total) * 100).toFixed(1) : "0.0";
  const openRate = sent ? ((opens / sent) * 100).toFixed(1) : "0.0";
  const clickRate = sent ? ((clicks / sent) * 100).toFixed(1) : "0.0";

  async function retryFailed() {
    setRetrying(true);
    try {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 200 })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Retry failed");
      await mutate();
    } catch (e) {
      console.error(e);
      alert((e as any)?.message ?? "Retry failed");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <PreflightPanel campaignId={id} canOverride={true} />
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{data.campaign.name}</h1>
          <p className="text-sm text-muted-foreground">Status: {data.campaign.status}</p>
        </div>
        <div className="flex items-center gap-6">
          <Stat label="Total" value={total} />
          <Stat label="Sent" value={sent} />
          <Stat label="Delivered" value={delivered} />
          <Stat label="Bounced" value={bounced} />
          <Stat label="Opens" value={opens} />
          <Stat label="Clicks" value={clicks} />
          {replyCounts && (
            <div className="text-sm px-3 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
              Replies: {replyCounts.replied_count} / {replyCounts.total}
            </div>
          )}
        </div>
      </div>

      {/* Funnel bar */}
      <Card className="rounded-2xl">
        <CardHeader><CardTitle>Funnel</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[
              { label: "Queued/Total", value: total },
              { label: "Sent", value: sent },
              { label: "Delivered", value: delivered },
              { label: "Bounced", value: bounced },
              { label: "Opens", value: opens },
              { label: "Clicks", value: clicks },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span>{row.label}</span>
                  <span className="text-muted-foreground">
                    {row.value}{row.label === "Queued/Total" ? "" : ` • ${total ? ((Number(row.value) / total) * 100).toFixed(1) : "0.0"}%`}
                  </span>
                </div>
                <div className="h-2 rounded bg-muted">
                  <div
                    className="h-2 rounded bg-foreground/70"
                    style={{
                      width: `${total ? (Number(row.value) / total) * 100 : 0}%`
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-4">
            <div className="flex items-center gap-2">
              <LaunchButton campaignId={id} />
              <ShareDialog campaignId={id} />
            </div>
            <Button onClick={() => router.push("/analytics")}>View Global Analytics</Button>
            <Button onClick={retryFailed} disabled={retrying}>
              {retrying ? "Re-queuing…" : `Retry Failed (${data.failed.length})`}
            </Button>
            <div className="text-sm text-muted-foreground ml-auto">
              Deliverability: {deliverRate}% • Open: {openRate}% • Click: {clickRate}%
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rotation Summary */}
      <RotationSummary campaignId={id} />

      {/* Steps Editor */}
      <div className="max-w-5xl mx-auto space-y-6">
        <SmartWindowsCard campaignId={id} />
        <StepsEditor campaignId={id} />
        <StepMetrics campaignId={id} />
      </div>

      {/* Inbox */}
      <div className="mt-6">
        <InboxList campaignId={id} />
      </div>

      {/* Recent Events */}
      <Card className="rounded-2xl">
        <CardHeader><CardTitle>Recent Events</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">To</th>
                  <th className="py-2 pr-3">Subject</th>
                  <th className="py-2 pr-3">Job</th>
                </tr>
              </thead>
              <tbody>
                {(data.recentEvents ?? []).map((e: any, i: number) => (
                  <tr key={i} className="border-t">
                    <td className="py-2 pr-3">{new Date(e.created_at).toLocaleString()}</td>
                    <td className="py-2 pr-3 capitalize">{e.event_type}</td>
                    <td className="py-2 pr-3">{e.to_email}</td>
                    <td className="py-2 pr-3 truncate max-w-[320px]">{e.subject}</td>
                    <td className="py-2 pr-3 text-xs">{e.job_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Failed list */}
      <Card className="rounded-2xl">
        <CardHeader><CardTitle>Failed Jobs</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">To</th>
                  <th className="py-2 pr-3">Subject</th>
                  <th className="py-2 pr-3">Attempts</th>
                  <th className="py-2 pr-3">Last Error</th>
                </tr>
              </thead>
              <tbody>
                {(data.failed ?? []).map((j: any) => (
                  <tr key={j.id} className="border-t">
                    <td className="py-2 pr-3">{new Date(j.created_at).toLocaleString()}</td>
                    <td className="py-2 pr-3">{j.to_email}</td>
                    <td className="py-2 pr-3 truncate max-w-[320px]">{j.subject}</td>
                    <td className="py-2 pr-3">{j.attempts}</td>
                    <td className="py-2 pr-3 truncate max-w-[360px]">{j.last_error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}