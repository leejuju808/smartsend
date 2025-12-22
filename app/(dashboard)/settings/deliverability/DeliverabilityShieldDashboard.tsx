"use client";

import { useEffect, useState } from "react";
import { Shield, AlertTriangle, CheckCircle, XCircle, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { createClientComponentClient } from "@/lib/supabase";

interface DomainHealth {
  health_score: number;
  bounce_rate: number;
  complaint_rate: number;
  dkim_valid: boolean;
  spf_valid: boolean;
  dmarc_valid: boolean;
  status: string;
}

interface DNSStatus {
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
  mx: boolean;
}

interface WarmupState {
  warmup_stage: number;
  warmup_status: string;
  current_daily_limit: number;
  target_daily_limit: number;
  emails_sent_today: number;
  emails_sent_total: number;
}

interface TrendPoint {
  date: string;
  count: number;
}

interface DeliverabilityEvent {
  id: string;
  event_type: string;
  severity: string;
  message: string;
  created_at: string;
}

export default function DeliverabilityShieldDashboard() {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [domain, setDomain] = useState<any>(null);
  const [health, setHealth] = useState<DomainHealth | null>(null);
  const [dns, setDns] = useState<DNSStatus | null>(null);
  const [warmup, setWarmup] = useState<WarmupState | null>(null);
  const [bounceTrend, setBounceTrend] = useState<TrendPoint[]>([]);
  const [complaintTrend, setComplaintTrend] = useState<TrendPoint[]>([]);
  const [events, setEvents] = useState<DeliverabilityEvent[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Get current user's org
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Get org_id from org_memberships
      const { data: membership } = await supabase
        .from("org_memberships")
        .select("org_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .single();

      if (!membership) return;

      const currentOrgId = membership.org_id;
      setOrgId(currentOrgId);

      // Fetch dashboard data
      const response = await fetch(`/api/deliverability/dashboard?org_id=${currentOrgId}`);
      if (!response.ok) {
        console.error("Failed to load deliverability data");
        return;
      }

      const data = await response.json();
      setDomain(data.domain);
      setHealth(data.health);
      setDns(data.dns);
      setWarmup(data.warmup);
      setBounceTrend(data.bounce_trend || []);
      setComplaintTrend(data.complaint_trend || []);
      setEvents(data.events || []);
    } catch (error) {
      console.error("Error loading deliverability data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckDNS = async () => {
    if (!domain?.id) return;

    try {
      const response = await fetch("/api/deliverability/check-dns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain_settings_id: domain.id }),
      });

      if (response.ok) {
        await loadData();
      }
    } catch (error) {
      console.error("Error checking DNS:", error);
    }
  };

  const handleCalculateHealth = async () => {
    if (!domain?.id) return;

    try {
      const response = await fetch("/api/deliverability/domain-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain_settings_id: domain.id }),
      });

      if (response.ok) {
        await loadData();
      }
    } catch (error) {
      console.error("Error calculating health:", error);
    }
  };

  const getHealthScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-blue-600";
    if (score >= 30) return "text-yellow-600";
    return "text-red-600";
  };

  const getHealthScoreBg = (score: number) => {
    if (score >= 80) return "bg-green-50 border-green-200";
    if (score >= 60) return "bg-blue-50 border-blue-200";
    if (score >= 30) return "bg-yellow-50 border-yellow-200";
    return "bg-red-50 border-red-200";
  };

  const getStatusLabel = (score: number) => {
    if (score >= 80) return "Excellent";
    if (score >= 60) return "Safe";
    if (score >= 30) return "Risky";
    return "Dangerous";
  };

  const getRedFlags = () => {
    const flags: string[] = [];

    if (!health) return flags;

    if (health.health_score < 30) {
      flags.push("Domain health score is critically low");
    }

    if (!dns?.spf) {
      flags.push("SPF record is not configured");
    }

    if (!dns?.dkim) {
      flags.push("DKIM record is not configured");
    }

    if (health.bounce_rate > 5) {
      flags.push(`Bounce rate is high: ${health.bounce_rate.toFixed(2)}%`);
    }

    if (health.complaint_rate > 0.3) {
      flags.push(`Complaint rate is high: ${health.complaint_rate.toFixed(2)}%`);
    }

    if (domain?.sending_paused) {
      flags.push(`Sending is paused: ${domain.pause_reason || "Safety threshold breached"}`);
    }

    return flags;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-sm text-gray-600">Loading deliverability data...</p>
        </div>
      </div>
    );
  }

  if (!domain) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Domain Configured</h3>
        <p className="text-sm text-gray-600 mb-4">
          Connect a sending domain to enable Deliverability Shield protection.
        </p>
        <a
          href="/settings/domain"
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Connect Domain
        </a>
      </div>
    );
  }

  const healthScore = health?.health_score || 50;
  const redFlags = getRedFlags();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Deliverability Shield</h1>
          <p className="text-sm text-gray-600 mt-1">
            Real-time domain protection, spam prevention & warmup system
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCheckDNS}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Check DNS
          </button>
          <button
            onClick={handleCalculateHealth}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            Refresh Health
          </button>
        </div>
      </div>

      {/* Domain Health Score */}
      <div className={`rounded-lg border-2 p-6 ${getHealthScoreBg(healthScore)}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Domain Health Score</h2>
            <p className="text-sm text-gray-600">
              {domain.domain} • {getStatusLabel(healthScore)}
            </p>
          </div>
          <div className="text-right">
            <div className={`text-5xl font-bold ${getHealthScoreColor(healthScore)}`}>
              {healthScore.toFixed(0)}
            </div>
            <div className="text-xs text-gray-600 mt-1">out of 100</div>
          </div>
        </div>

        {/* Score Breakdown */}
        {health && (
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-gray-600 mb-1">Bounce Rate</div>
              <div className="text-lg font-semibold">
                {health.bounce_rate.toFixed(2)}%
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">Complaint Rate</div>
              <div className="text-lg font-semibold">
                {health.complaint_rate.toFixed(2)}%
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">Open Rate</div>
              <div className="text-lg font-semibold">
                {health.open_rate?.toFixed(1) || "0.0"}%
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">Status</div>
              <div className="text-lg font-semibold capitalize">{health.status}</div>
            </div>
          </div>
        )}
      </div>

      {/* DNS Status */}
      <div className="rounded-lg border bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">DNS Status</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <DNSCard
            label="SPF"
            valid={dns?.spf || false}
            required
          />
          <DNSCard
            label="DKIM"
            valid={dns?.dkim || false}
            required
          />
          <DNSCard
            label="DMARC"
            valid={dns?.dmarc || false}
            required={false}
          />
          <DNSCard
            label="MX"
            valid={dns?.mx || false}
            required
          />
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Bounce Rate Trend */}
        <div className="rounded-lg border bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Bounce Rate Trend (30 days)</h2>
          <TrendChart data={bounceTrend} color="red" />
        </div>

        {/* Complaint Rate Trend */}
        <div className="rounded-lg border bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Complaint Rate Trend (30 days)</h2>
          <TrendChart data={complaintTrend} color="orange" />
        </div>
      </div>

      {/* Warmup Progress */}
      {warmup && warmup.warmup_status === "warming" && (
        <div className="rounded-lg border bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Warmup Progress</h2>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-600">Day {warmup.warmup_stage}</span>
                <span className="text-gray-900 font-medium">
                  {warmup.emails_sent_today} / {warmup.current_daily_limit} emails
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all"
                  style={{
                    width: `${Math.min((warmup.emails_sent_today / warmup.current_daily_limit) * 100, 100)}%`,
                  }}
                />
              </div>
            </div>
            <div className="text-sm text-gray-600">
              Total sent: {warmup.emails_sent_total} emails • Target: {warmup.target_daily_limit} emails/day
            </div>
          </div>
        </div>
      )}

      {/* Red Flags */}
      {redFlags.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <h2 className="text-lg font-semibold text-red-900">Red Flags</h2>
          </div>
          <ul className="space-y-2">
            {redFlags.map((flag, idx) => (
              <li key={idx} className="text-sm text-red-800 flex items-start gap-2">
                <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{flag}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent Events */}
      {events.length > 0 && (
        <div className="rounded-lg border bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Events</h2>
          <div className="space-y-3">
            {events.slice(0, 10).map((event) => (
              <div
                key={event.id}
                className="flex items-start gap-3 p-3 rounded-md bg-gray-50"
              >
                <div className="flex-shrink-0 mt-0.5">
                  {event.severity === "critical" || event.severity === "error" ? (
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                  ) : event.severity === "warning" ? (
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  ) : (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900">{event.message}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(event.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DNSCard({ label, valid, required }: { label: string; valid: boolean; required: boolean }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-md border">
      {valid ? (
        <CheckCircle className="h-5 w-5 text-green-600" />
      ) : (
        <XCircle className="h-5 w-5 text-red-600" />
      )}
      <div>
        <div className="font-medium text-gray-900">{label}</div>
        <div className="text-xs text-gray-600">
          {valid ? "Valid" : required ? "Required" : "Optional"}
        </div>
      </div>
    </div>
  );
}

function TrendChart({ data, color }: { data: TrendPoint[]; color: "red" | "orange" }) {
  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
        No data available
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const colorClass = color === "red" ? "bg-red-500" : "bg-orange-500";

  return (
    <div className="h-48 flex items-end gap-1">
      {data.map((point, idx) => (
        <div
          key={idx}
          className="flex-1 bg-gray-100 rounded-t"
          style={{
            height: `${(point.count / maxCount) * 100}%`,
            minHeight: point.count > 0 ? "4px" : "0",
          }}
          title={`${point.date}: ${point.count}`}
        >
          {point.count > 0 && (
            <div className={`w-full ${colorClass} rounded-t`} style={{ height: "100%" }} />
          )}
        </div>
      ))}
    </div>
  );
}





















































