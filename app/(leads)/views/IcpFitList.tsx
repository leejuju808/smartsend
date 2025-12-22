"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type LeadRow = {
  id: string;
  company_name?: string | null;
  email?: string | null;
  employee_count?: number | null;
  industry?: string | null;
  tech_stack?: Record<string, unknown> | string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function hasHubspot(techStack: LeadRow["tech_stack"]) {
  if (!techStack) return false;
  if (Array.isArray(techStack)) {
    return techStack.map((t) => String(t).toLowerCase()).includes("hubspot");
  }
  if (typeof techStack === "object") {
    return Object.prototype.hasOwnProperty.call(techStack, "hubspot");
  }
  return false;
}

export function IcpFitList({ viewId }: { viewId: string }) {
  const { data } = useSWR<{ ok?: boolean; rows?: LeadRow[] }>(
    viewId ? `/api/saved-views/${viewId}/run` : null,
    fetcher,
    { refreshInterval: 15000, revalidateOnFocus: false }
  );

  const rows = data?.rows ?? [];

  return (
    <div className="grid gap-2">
      {rows.map((lead) => {
        const timestamp = lead.updated_at ?? lead.created_at;
        return (
          <Card key={lead.id} className="flex items-center justify-between p-3 text-sm">
            <div className="truncate">
              <div className="font-medium">
                {lead.company_name ?? "Company"} — {lead.email ?? "unknown"}
              </div>
              <div className="flex gap-2 text-xs opacity-70">
                <Badge variant="secondary">emp {lead.employee_count ?? "?"}</Badge>
                {hasHubspot(lead.tech_stack) && <Badge variant="outline">HubSpot</Badge>}
                {String(lead.industry ?? "")
                  .toLowerCase()
                  .includes("saas") && <Badge variant="outline">SaaS</Badge>}
              </div>
            </div>
            <div className="text-xs opacity-60">
              {timestamp ? new Date(timestamp).toLocaleDateString() : "—"}
            </div>
          </Card>
        );
      })}
      {rows.length === 0 && (
        <Card className="p-3 text-sm text-muted-foreground">No leads match this view yet.</Card>
      )}
    </div>
  );
}

