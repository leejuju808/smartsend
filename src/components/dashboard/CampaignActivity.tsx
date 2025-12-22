"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";

const labels: Record<string, string> = {
  invite_created: "📨 Invite sent",
  invite_accepted: "✅ Invite accepted",
  policy_updated: "⚙️ Policy updated",
  email_sent: "✉️ Email sent",
  reply_received: "💬 Reply received",
};

export default function CampaignActivity({ campaignId }: { campaignId: string }) {
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    fetch(`/api/campaigns/${campaignId}/activity`)
      .then((r) => r.json())
      .then((j) => setItems(j.items || []))
      .catch(() => setItems([]));
  }, [campaignId]);

  return (
    <Card>
      <CardHeader className="pb-2 flex items-center justify-between">
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {items.length === 0 && <div className="text-muted-foreground">No recent activity.</div>}
        <ul className="space-y-3">
          {items.map((i) => (
            <li key={i.id} className="border-b pb-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{i.action}</Badge>
                <span>{labels[i.action] || i.action}</span>
              </div>
              {i.meta?.to && <div className="text-muted-foreground ml-6">To: {i.meta.to}</div>}
              {i.meta?.email && <div className="text-muted-foreground ml-6">Email: {i.meta.email}</div>}
              {i.meta?.role && <div className="text-muted-foreground ml-6">Role: {i.meta.role}</div>}
              {i.meta?.from && <div className="text-muted-foreground ml-6">From: {i.meta.from}</div>}
              {i.meta?.subject && <div className="text-muted-foreground ml-6">Subject: {i.meta.subject}</div>}
              <div className="text-xs text-muted-foreground ml-6">{new Date(i.created_at).toLocaleString()}</div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

