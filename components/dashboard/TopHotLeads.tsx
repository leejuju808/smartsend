// Block 21731 — SmartSend Roofing Lead Dashboard v1
// Top 10 Hottest Leads Widget Component

import { LeadHeatScore } from "@/components/lead/LeadHeatScore";

interface TopHotLead {
  id: string;
  name: string | null;
  email: string | null;
  city?: string | null; // Optional - might not exist in all leads tables
  heat_score: number | null;
  status?: string | null;
}

interface TopHotLeadsProps {
  leads: TopHotLead[];
}

export function TopHotLeads({ leads }: TopHotLeadsProps) {
  if (leads.length === 0) {
    return (
      <div className="rounded-xl bg-white/5 border border-white/10 p-4">
        <h2 className="font-bold text-white mb-3">🔥 Top 10 Hottest Leads</h2>
        <div className="text-sm text-gray-400">No active leads with heat scores yet.</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-4">
      <h2 className="font-bold text-white mb-3">🔥 Top 10 Hottest Leads</h2>

      <div className="space-y-3">
        {leads.map((lead) => (
          <div
            key={lead.id}
            className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-white truncate">
                {lead.name || lead.email || "Unknown"}
              </div>
              {lead.city && (
                <div className="text-xs text-gray-400">{lead.city}</div>
              )}
            </div>
            <div className="ml-4 flex-shrink-0">
              <LeadHeatScore score={lead.heat_score ?? 0} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

