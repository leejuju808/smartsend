"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import Link from "next/link";

interface CampaignsTabProps {
  campaigns: Array<{
    id: string;
    campaign_id: string;
    status: string;
    created_at: string;
    campaigns?: {
      id: string;
      name: string;
      status?: string;
    };
  }>;
  leadId?: string;
}

interface RoutingHistory {
  id: string;
  rule_id: string | null;
  rule_name: string | null;
  campaign_id: string;
  campaign_name: string | null;
  routed_at: string;
  reason: string | null;
}

export default function CampaignsTab({ campaigns, leadId }: CampaignsTabProps) {
  const supabase = createClientComponentClient();
  const [routingHistory, setRoutingHistory] = useState<RoutingHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!leadId) return;

    async function loadRoutingHistory() {
      setLoadingHistory(true);
      try {
        const { data, error } = await supabase.rpc("get_lead_routing_history", {
          p_lead_id: leadId,
        });

        if (error) throw error;
        if (data) {
          setRoutingHistory(data as RoutingHistory[]);
        }
      } catch (error) {
        console.error("Error loading routing history:", error);
      } finally {
        setLoadingHistory(false);
      }
    }

    loadRoutingHistory();
  }, [leadId, supabase]);

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      new: { label: "New", variant: "secondary" },
      queued: { label: "Queued", variant: "secondary" },
      sent: { label: "Sent", variant: "default" },
      replied: { label: "Replied", variant: "default" },
      unsub: { label: "Unsubscribed", variant: "outline" },
      bounced: { label: "Bounced", variant: "destructive" },
      paused: { label: "Paused", variant: "outline" },
    };

    const config = statusMap[status] || { label: status, variant: "secondary" as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (campaigns.length === 0) {
    return (
      <div className="mt-4 p-8 text-center text-muted-foreground">
        <p>This lead is not part of any campaigns yet.</p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-6">
      {/* Routing History */}
      {routingHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Routing History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {routingHistory.map((history) => (
                <div key={history.id} className="border rounded-lg p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/campaigns/${history.campaign_id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {history.campaign_name || "Unknown Campaign"}
                      </Link>
                      <Badge variant="outline" className="text-xs">
                        Auto-Routed
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(history.routed_at), "MMM d, yyyy h:mm a")}
                    </span>
                  </div>
                  {history.reason && (
                    <p className="text-xs text-muted-foreground">
                      Rule: {history.reason}
                    </p>
                  )}
                  {history.rule_name && (
                    <p className="text-xs text-muted-foreground">
                      Rule Name: {history.rule_name}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Campaign Memberships */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Campaign Memberships</h3>
        {campaigns.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <p>This lead is not part of any campaigns yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {campaigns.map((campaignLead) => (
              <Card key={campaignLead.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Link
                        href={`/campaigns/${campaignLead.campaign_id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {campaignLead.campaigns?.name || "Unknown Campaign"}
                      </Link>
                      {getStatusBadge(campaignLead.status)}
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>
                        Added: {format(new Date(campaignLead.created_at), "MMM d, yyyy h:mm a")}
                      </p>
                      {campaignLead.campaigns?.status && (
                        <p>Campaign Status: {campaignLead.campaigns.status}</p>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

