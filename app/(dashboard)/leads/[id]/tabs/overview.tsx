"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface OverviewTabProps {
  data: {
    lead: any;
    campaigns?: any[];
    tags?: any[];
  };
}

export default function OverviewTab({ data }: OverviewTabProps) {
  const { lead, campaigns = [], tags = [] } = data;

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      new: { label: "New", variant: "secondary" },
      contacted: { label: "Contacted", variant: "default" },
      replied: { label: "Replied", variant: "default" },
      bounced: { label: "Bounced", variant: "destructive" },
      unsubscribed: { label: "Unsubscribed", variant: "outline" },
    };

    const config = statusMap[status] || { label: status, variant: "secondary" as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <div className="space-y-6 mt-4">
      {/* Basic Info */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Basic Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Email</label>
            <p className="text-sm">{lead.email}</p>
          </div>
          {lead.phone && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Phone</label>
              <p className="text-sm">{lead.phone}</p>
            </div>
          )}
          {lead.company && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Company</label>
              <p className="text-sm">{lead.company}</p>
            </div>
          )}
          {lead.title && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Title</label>
              <p className="text-sm">{lead.title}</p>
            </div>
          )}
          {lead.website && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Website</label>
              <p className="text-sm">
                <a href={lead.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  {lead.website}
                </a>
              </p>
            </div>
          )}
          {lead.linkedin && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">LinkedIn</label>
              <p className="text-sm">
                <a href={lead.linkedin} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  {lead.linkedin}
                </a>
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Status & Tags */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Status & Tags</h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Lead Status</label>
            <div className="mt-1">{getStatusBadge(lead.status || "new")}</div>
          </div>
          {tags.length > 0 && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Tags</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {tags.map((tag: any) => (
                  <Badge key={tag.id} variant="secondary">
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {lead.tags && Array.isArray(lead.tags) && lead.tags.length > 0 && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Tags (Legacy)</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {lead.tags.map((tag: string, idx: number) => (
                  <Badge key={idx} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Campaign Summary */}
      {campaigns.length > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Campaigns</h2>
          <div className="space-y-2">
            {campaigns.slice(0, 5).map((campaignLead: any) => (
              <div key={campaignLead.id} className="flex items-center justify-between p-2 rounded border">
                <div>
                  <p className="text-sm font-medium">
                    {campaignLead.campaigns?.name || "Unknown Campaign"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Status: {campaignLead.status || "new"}
                  </p>
                </div>
                <Badge variant="outline">{campaignLead.status || "new"}</Badge>
              </div>
            ))}
            {campaigns.length > 5 && (
              <p className="text-xs text-muted-foreground mt-2">
                +{campaigns.length - 5} more campaigns
              </p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}



