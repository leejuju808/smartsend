// Block 17600 — SmartSend Contact Priority Engine v1
// Top 10 Leads Today Widget
// Shows the top 10 leads ranked by priority score

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type PriorityLead = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  score: number;
  priority_band: string;
  reason: string;
  next_action: string;
  is_neglected: boolean;
  hours_since_last_touch: number | null;
  days_since_last_reply: number | null;
  component_scores: {
    heat: number;
    urgency: number;
    insurance_value: number;
    storm_risk: number;
    money_potential: number;
    engagement: number;
  };
  contact_details: {
    estimated_value_min: number | null;
    estimated_value_max: number | null;
    job_type: string | null;
    pipeline_stage_key: string | null;
    next_appointment_at: string | null;
    quote_amount: number | null;
  };
};

function getPriorityBandColor(band: string): string {
  switch (band) {
    case "priority_1":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    case "priority_2":
      return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    case "priority_3":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "priority_4":
      return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    default:
      return "bg-neutral-800 text-neutral-100 border-neutral-700";
  }
}

function getPriorityBandLabel(band: string): string {
  switch (band) {
    case "priority_1":
      return "🔥 Priority 1";
    case "priority_2":
      return "🔥 Priority 2";
    case "priority_3":
      return "Priority 3";
    case "priority_4":
      return "Priority 4";
    default:
      return "Priority 5";
  }
}

function formatValue(min: number | null, max: number | null): string {
  if (!min && !max) return "—";
  if (min && max) {
    const avg = (min + max) / 2;
    return `$${Math.round(avg).toLocaleString()}`;
  }
  return `$${Math.round((min || max || 0)).toLocaleString()}`;
}

export function Top10LeadsTodayWidget() {
  const [leads, setLeads] = useState<PriorityLead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/priority/top?limit=10", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          setLeads(json.leads || []);
        } else {
          console.error("Failed to load top priority leads");
        }
      } catch (err) {
        console.error("Failed to load top priority leads:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
    
    // Refresh every 5 minutes
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-lg">Your Top 10 Leads Today</h3>
            <p className="text-sm text-muted-foreground">
              Ranked by priority score
            </p>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-lg">Your Top 10 Leads Today</h3>
            <p className="text-sm text-muted-foreground">
              Ranked by priority score
            </p>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          No leads with priority scores yet. Scores are calculated automatically.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-lg">Your Top 10 Leads Today</h3>
          <p className="text-sm text-muted-foreground">
            Ranked by priority score — who to work first
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {leads.map((lead, index) => {
          const bandColor = getPriorityBandColor(lead.priority_band);
          const bandLabel = getPriorityBandLabel(lead.priority_band);
          const estimatedValue = formatValue(
            lead.contact_details.estimated_value_min,
            lead.contact_details.estimated_value_max
          );

          return (
            <div
              key={lead.id}
              className={`flex items-start justify-between gap-3 rounded-lg border p-3 transition-colors ${
                lead.is_neglected
                  ? "border-orange-500/50 bg-orange-500/5 hover:bg-orange-500/10"
                  : "border-border bg-background hover:bg-muted/50"
              }`}
            >
              <div className="flex items-start gap-3 flex-1 min-w-0">
                {/* Rank */}
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
                  {index + 1}
                </div>

                {/* Lead Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <div className="text-sm font-medium truncate">
                      {lead.name}
                    </div>
                    <div
                      className={`rounded-lg px-2 py-0.5 text-xs font-semibold border ${bandColor}`}
                    >
                      {bandLabel}
                    </div>
                    <div className="text-xs font-mono text-muted-foreground">
                      Score: {lead.score}
                    </div>
                    {lead.is_neglected && (
                      <div className="text-xs text-orange-500 font-medium">
                        ⚠️ Neglected
                      </div>
                    )}
                  </div>

                  {/* Reason */}
                  {lead.reason && (
                    <div className="text-xs text-muted-foreground mb-1">
                      {lead.reason}
                    </div>
                  )}

                  {/* Next Action */}
                  <div className="text-xs font-medium text-primary mb-1">
                    → {lead.next_action}
                  </div>

                  {/* Details */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    {lead.city && lead.state && (
                      <span>{lead.city}, {lead.state}</span>
                    )}
                    {estimatedValue !== "—" && (
                      <span>💰 {estimatedValue}</span>
                    )}
                    {lead.contact_details.job_type && (
                      <span className="capitalize">
                        {lead.contact_details.job_type.replace("_", " ")}
                      </span>
                    )}
                    {lead.days_since_last_reply !== null && lead.days_since_last_reply > 0 && (
                      <span>
                        {Math.round(lead.days_since_last_reply)}d ago
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <Link
                href={`/contacts/${lead.id}`}
                className="flex-shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 transition-colors whitespace-nowrap"
              >
                View Lead
              </Link>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t text-xs text-muted-foreground">
        <p>
          Priority scores are calculated from: Insurance Value (30%), Heat Score (25%), 
          Storm Risk (20%), Urgency (15%), Money Potential (5%), Engagement (5%)
        </p>
      </div>
    </div>
  );
}





















































