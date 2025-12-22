"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface LeadQuality {
  id: string;
  lead_id: string;
  quality_score: number | null;
  lead_type: string | null;
  urgency: string | null;
  intent: string | null;
  risk_flags: string[] | null;
  enrichment: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

interface LeadQualityCardProps {
  leadId: string;
}

export function LeadQualityCard({ leadId }: LeadQualityCardProps) {
  const [quality, setQuality] = useState<LeadQuality | null>(null);
  const [loading, setLoading] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);

  useEffect(() => {
    loadQuality();
  }, [leadId]);

  async function loadQuality() {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("lead_quality")
      .select("*")
      .eq("lead_id", leadId)
      .single();

    if (!error && data) {
      setQuality(data);
    }
    setLoading(false);
  }

  async function triggerScrub() {
    setScrubbing(true);
    try {
      const response = await fetch(`/api/leads/${leadId}/scrub`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "manual" }),
      });

      if (response.ok) {
        await loadQuality();
      }
    } catch (error) {
      console.error("Failed to scrub lead:", error);
    } finally {
      setScrubbing(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (!quality) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Lead Qualification</h3>
          <button
            onClick={triggerScrub}
            disabled={scrubbing}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {scrubbing ? "Qualifying..." : "Qualify Lead"}
          </button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          No quality data available. Click "Qualify Lead" to analyze this lead.
        </p>
      </div>
    );
  }

  const score = quality.quality_score ?? 0;
  const scoreColor =
    score >= 80
      ? "text-green-600"
      : score >= 60
      ? "text-blue-600"
      : score >= 40
      ? "text-yellow-600"
      : "text-red-600";

  const leadTypeLabels: Record<string, string> = {
    hot_lead: "🔥 Hot Lead",
    warm_lead: "🟡 Warm Lead",
    cold_lead: "🔵 Cold Lead",
    emergency_lead: "🚨 Emergency",
    insurance_lead: "🏠 Insurance",
    retail_lead: "💰 Retail",
    bad_lead: "❌ Bad Lead",
    out_of_service_area: "📍 Out of Area",
    rental_tenant: "🏘️ Rental Tenant",
  };

  const urgencyColors: Record<string, string> = {
    high: "bg-red-100 text-red-800",
    medium: "bg-yellow-100 text-yellow-800",
    low: "bg-gray-100 text-gray-800",
  };

  const intentLabels: Record<string, string> = {
    ready_to_buy: "Ready to Buy",
    shopping: "Shopping Around",
    curious: "Just Curious",
    not_interested: "Not Interested",
    unclear: "Unclear",
  };

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Lead Qualification</h3>
        <button
          onClick={triggerScrub}
          disabled={scrubbing}
          className="rounded-md border px-3 py-1 text-xs hover:bg-accent disabled:opacity-50"
        >
          {scrubbing ? "Re-qualifying..." : "Refresh"}
        </button>
      </div>

      {/* Quality Score */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Quality Score</span>
          <span className={`text-2xl font-bold ${scoreColor}`}>{score}/100</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${
              score >= 80
                ? "bg-green-500"
                : score >= 60
                ? "bg-blue-500"
                : score >= 40
                ? "bg-yellow-500"
                : "bg-red-500"
            }`}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>

      {/* Lead Type & Classification */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Lead Type</p>
          <p className="font-medium">
            {quality.lead_type
              ? leadTypeLabels[quality.lead_type] || quality.lead_type
              : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Urgency</p>
          {quality.urgency ? (
            <span
              className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${
                urgencyColors[quality.urgency] || urgencyColors.low
              }`}
            >
              {quality.urgency.charAt(0).toUpperCase() + quality.urgency.slice(1)}
            </span>
          ) : (
            <p className="text-muted-foreground">—</p>
          )}
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Intent</p>
          <p className="font-medium">
            {quality.intent
              ? intentLabels[quality.intent] || quality.intent
              : "—"}
          </p>
        </div>
      </div>

      {/* Risk Flags */}
      {quality.risk_flags && quality.risk_flags.length > 0 && (
        <div className="mb-6">
          <p className="text-xs text-muted-foreground mb-2">Risk Flags</p>
          <div className="flex flex-wrap gap-2">
            {quality.risk_flags.map((flag, idx) => (
              <span
                key={idx}
                className="inline-block rounded-md bg-red-100 px-2 py-1 text-xs text-red-800"
              >
                ⚠️ {flag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Enrichment Data */}
      {quality.enrichment && Object.keys(quality.enrichment).length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">Property Details</p>
          <div className="space-y-1 text-sm">
            {quality.enrichment.property_size && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Property Size:</span>
                <span>{quality.enrichment.property_size}</span>
              </div>
            )}
            {quality.enrichment.home_value && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Home Value:</span>
                <span>{quality.enrichment.home_value}</span>
              </div>
            )}
            {quality.enrichment.estimated_roof_cost && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Est. Roof Cost:</span>
                <span>{quality.enrichment.estimated_roof_cost}</span>
              </div>
            )}
            {quality.enrichment.roof_type_guess && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Roof Type:</span>
                <span>{quality.enrichment.roof_type_guess}</span>
              </div>
            )}
            {quality.enrichment.storm_risk && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Storm Risk:</span>
                <span className="capitalize">{quality.enrichment.storm_risk}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Last updated: {new Date(quality.updated_at).toLocaleString()}
      </p>
    </div>
  );
}
































