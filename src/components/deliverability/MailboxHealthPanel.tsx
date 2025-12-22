// src/components/deliverability/MailboxHealthPanel.tsx
// Mailbox Health (last 7 days): Health score sparkline, Sends, Bounce %, Complaint %, Opens %.

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

interface MailboxHealthData {
  mailbox_email: string;
  day: string;
  sends: number;
  bounces: number;
  complaints: number;
  opens: number;
  replies: number;
  health_score: number;
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length === 0) return null;
  
  const max = Math.max(...points, 0.1);
  const width = 100;
  const height = 20;
  const padding = 2;
  
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1 || 1)) * (width - padding * 2) + padding;
      const y = height - (p / max) * (height - padding * 2) - padding;
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className="overflow-visible">
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-blue-600"
      />
    </svg>
  );
}

export function MailboxHealthPanel({ accountId }: { accountId: string }) {
  const supabase = createClientComponentClient();
  const [data, setData] = useState<Record<string, MailboxHealthData[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const { data: health, error } = await supabase
          .from("sender_health")
          .select("*")
          .eq("account_id", accountId)
          .gte("day", sevenDaysAgo.toISOString().slice(0, 10))
          .order("day", { ascending: true });

        if (error) throw error;

        // Group by mailbox_email
        const grouped: Record<string, MailboxHealthData[]> = {};
        for (const row of health || []) {
          if (!grouped[row.mailbox_email]) {
            grouped[row.mailbox_email] = [];
          }
          grouped[row.mailbox_email].push(row);
        }

        setData(grouped);
      } catch (err) {
        console.error("Error loading mailbox health:", err);
      } finally {
        setLoading(false);
      }
    }

    if (accountId) {
      load();
    }
  }, [accountId, supabase]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Mailbox Health (Last 7 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  const mailboxes = Object.keys(data);

  if (mailboxes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Mailbox Health (Last 7 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">No data available</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mailbox Health (Last 7 Days)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {mailboxes.map((email) => {
            const rows = data[email];
            const latest = rows[rows.length - 1];
            const totalSends = rows.reduce((sum, r) => sum + r.sends, 0);
            const totalBounces = rows.reduce((sum, r) => sum + r.bounces, 0);
            const totalComplaints = rows.reduce((sum, r) => sum + r.complaints, 0);
            const totalOpens = rows.reduce((sum, r) => sum + r.opens, 0);
            const bounceRate = totalSends > 0 ? (totalBounces / totalSends) * 100 : 0;
            const complaintRate = totalSends > 0 ? (totalComplaints / totalSends) * 100 : 0;
            const openRate = totalSends > 0 ? (totalOpens / totalSends) * 100 : 0;
            const healthScores = rows.map((r) => r.health_score ?? 0);

            return (
              <div key={email} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-medium">{email}</div>
                  <div className="text-xs text-muted-foreground">
                    Health: {(latest.health_score ?? 0).toFixed(2)}
                  </div>
                </div>
                <div className="mb-2">
                  <Sparkline points={healthScores} />
                </div>
                <div className="grid grid-cols-4 gap-2 text-sm">
                  <div>
                    <div className="text-muted-foreground">Sends</div>
                    <div className="font-semibold">{totalSends}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Bounce %</div>
                    <div className={`font-semibold ${bounceRate > 5 ? "text-red-600" : ""}`}>
                      {bounceRate.toFixed(2)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Complaint %</div>
                    <div className={`font-semibold ${complaintRate > 0.2 ? "text-red-600" : ""}`}>
                      {complaintRate.toFixed(2)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Opens %</div>
                    <div className="font-semibold">{openRate.toFixed(1)}%</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}















