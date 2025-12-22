"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/src/components/ui/Card";
import { Badge } from "@/src/components/ui/badge";
import { Megaphone } from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  status: string;
  emailsSent7d: number;
  replies7d: number;
  hotLeads7d: number;
}

interface CampaignSnapshotPanelProps {
  campaigns: Campaign[];
}

export function CampaignSnapshotPanel({ campaigns }: CampaignSnapshotPanelProps) {
  const calculateReplyRate = (sent: number, replies: number) => {
    if (sent === 0) return "0.0";
    return ((replies / sent) * 100).toFixed(1);
  };

  // Sort by reply rate (highest first) or most recent activity
  const sortedCampaigns = [...campaigns].sort((a, b) => {
    const rateA = parseFloat(calculateReplyRate(a.emailsSent7d, a.replies7d));
    const rateB = parseFloat(calculateReplyRate(b.emailsSent7d, b.replies7d));
    return rateB - rateA;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-purple-500" />
          Campaign Snapshot (Last 7 Days)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sortedCampaigns.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4">
            No active campaigns. Create one to start sending emails.
          </div>
        ) : (
          <div className="space-y-3">
            {sortedCampaigns.map((campaign) => (
              <Link
                key={campaign.id}
                href={`/campaigns/${campaign.id}`}
                className="block p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{campaign.name}</span>
                    <Badge
                      variant={
                        campaign.status === "active" || campaign.status === "running"
                          ? "success"
                          : "secondary"
                      }
                    >
                      {campaign.status}
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 text-sm">
                  <div>
                    <div className="text-muted-foreground">Sent</div>
                    <div className="font-semibold">{campaign.emailsSent7d}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Replies</div>
                    <div className="font-semibold">{campaign.replies7d}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Reply Rate</div>
                    <div className="font-semibold">
                      {calculateReplyRate(campaign.emailsSent7d, campaign.replies7d)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Hot Leads</div>
                    <div className="font-semibold text-orange-600">
                      {campaign.hotLeads7d}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

