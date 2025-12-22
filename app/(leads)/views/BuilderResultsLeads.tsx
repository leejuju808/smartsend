"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function BuilderResultsLeads({ rows }: { rows: any[] }) {
  return (
    <div className="grid gap-2 mt-3">
      {rows.map((lead: any) => (
        <Card key={lead.id} className="p-3 text-sm flex items-center justify-between">
          <div className="truncate">
            <div className="font-medium">
              {lead.company_name ?? lead.company ?? "Lead"} — {lead.email}
            </div>
            <div className="text-xs opacity-70 flex gap-2">
              {lead.employee_count ? <Badge variant="secondary">emp {lead.employee_count}</Badge> : null}
              {lead.tech_stack?.hubspot ? <Badge variant="outline">HubSpot</Badge> : null}
              {String(lead.industry ?? "").toLowerCase().includes("saas") ? (
                <Badge variant="outline">SaaS</Badge>
              ) : null}
            </div>
          </div>
          <div className="text-xs opacity-60">
            {new Date(lead.updated_at ?? lead.created_at ?? Date.now()).toLocaleDateString()}
          </div>
        </Card>
      ))}
    </div>
  );
}

