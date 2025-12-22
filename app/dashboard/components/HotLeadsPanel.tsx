"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/src/components/ui/Card";
import { Badge } from "@/src/components/ui/badge";
import { Flame } from "lucide-react";

interface HotLead {
  contactId: string;
  name: string | null;
  email: string;
  lastIntent: string;
  lastActivityAt: string;
  campaignName?: string | null;
}

interface HotLeadsPanelProps {
  hotLeads: HotLead[];
}

export function HotLeadsPanel({ hotLeads }: HotLeadsPanelProps) {
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-500" />
          HOT Leads to Work
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hotLeads.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4">
            No HOT leads right now. Launch a campaign or check WARM leads.
          </div>
        ) : (
          <div className="space-y-3">
            {hotLeads.map((lead) => (
              <Link
                key={lead.contactId}
                href={`/contacts/${lead.contactId}`}
                className="block p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium truncate">
                        {lead.name || lead.email}
                      </span>
                      <Badge variant="destructive">HOT</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground truncate">
                      {lead.email}
                    </div>
                    {lead.campaignName && (
                      <div className="text-xs text-muted-foreground mt-1">
                        From: {lead.campaignName}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground ml-2">
                    {formatTimeAgo(lead.lastActivityAt)}
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

