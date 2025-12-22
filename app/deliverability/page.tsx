"use client";

import { useState } from "react";
import useSWR from "swr";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/button";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface DomainReputation {
  reputation_score: number;
  updated_at: string;
}

interface InboxHealth {
  spam_rate: number;
  bounce_rate: number;
  open_rate: number;
  click_rate: number;
  warmup_stage: number;
  score: number;
  updated_at: string;
}

interface Domain {
  id: string;
  domain: string;
  spf_valid: boolean;
  dkim_valid: boolean;
  dmarc_valid: boolean;
  mx_valid: boolean;
  health: string;
  domain_reputation: DomainReputation[];
}

interface Inbox {
  id: string;
  email: string;
  provider: string;
  daily_limit: number;
  warmup_enabled: boolean;
  connected: boolean;
  inbox_health: InboxHealth[];
}

interface WorkspaceStats {
  spam_rate: number;
  bounce_rate: number;
  avg_open_rate: number;
  avg_click_rate: number;
}

interface DeliverabilityData {
  domains: Domain[];
  inboxes: Inbox[];
  workspace: WorkspaceStats | null;
}

interface AuditResult {
  score: number;
  summary: string;
  warnings: string[];
  fixes: string[];
  recommended_window: {
    days: string[];
    start: string;
    end: string;
  };
  warmup_recommendations: string[];
  dns_fixes: string[];
  campaign_fixes: string[];
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-600">{label}</span>
      <span className={ok ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
        {ok ? "✓" : "✗"}
      </span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string | null | undefined }) {
  const displayValue = value !== null && value !== undefined ? value : "—";
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium">{displayValue}</span>
    </div>
  );
}

function getHealthColor(health: string) {
  switch (health) {
    case "excellent":
      return "text-green-600";
    case "good":
      return "text-blue-600";
    case "poor":
      return "text-red-600";
    default:
      return "text-gray-600";
  }
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function DomainSection({ domains }: { domains: Domain[] }) {
  if (domains.length === 0) {
    return (
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Domain Health</h2>
        <p className="text-gray-500 text-sm">No domains configured yet.</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold mb-4">Domain Health</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {domains.map((d) => {
          const reputation = d.domain_reputation?.[0];
          const health = d.health || "poor";
          return (
            <Card key={d.id} className="p-4 border">
              <h3 className="font-bold text-lg mb-3">{d.domain}</h3>

              <div className="mt-3 space-y-1 text-sm">
                <StatusRow label="SPF" ok={d.spf_valid} />
                <StatusRow label="DKIM" ok={d.dkim_valid} />
                <StatusRow label="DMARC" ok={d.dmarc_valid} />
                <StatusRow label="MX" ok={d.mx_valid} />
              </div>

              <div className="mt-4 pt-3 border-t">
                <div className="text-sm font-medium">
                  Reputation Score:{" "}
                  <span className={reputation?.reputation_score ? "text-blue-600" : "text-gray-500"}>
                    {reputation?.reputation_score ?? "—"}
                  </span>
                </div>
                <div className="text-sm font-medium mt-1">
                  Health: <span className={getHealthColor(health)}>{health}</span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </Card>
  );
}

function InboxSection({ inboxes }: { inboxes: Inbox[] }) {
  if (inboxes.length === 0) {
    return (
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Inbox Health</h2>
        <p className="text-gray-500 text-sm">No inboxes configured yet.</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold mb-4">Inbox Health</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {inboxes.map((i) => {
          const health = i.inbox_health?.[0];
          return (
            <Card key={i.id} className="p-4 border">
              <h3 className="font-bold text-lg mb-3">{i.email}</h3>

              <div className="mt-3 text-sm space-y-1">
                <Metric label="Bounce Rate" value={formatPercent(health?.bounce_rate)} />
                <Metric label="Spam Rate" value={formatPercent(health?.spam_rate)} />
                <Metric label="Open Rate" value={formatPercent(health?.open_rate)} />
                <Metric label="Click Rate" value={formatPercent(health?.click_rate)} />
                <Metric label="Warmup Stage" value={health?.warmup_stage ?? "—"} />
                <Metric label="Health Score" value={health?.score ?? "—"} />
              </div>

              <div className="mt-4 pt-3 border-t text-xs text-gray-500">
                <div>Provider: {i.provider}</div>
                <div>Daily Limit: {i.daily_limit}</div>
                <div>Warmup: {i.warmup_enabled ? "Enabled" : "Disabled"}</div>
                <div>Status: {i.connected ? "Connected" : "Disconnected"}</div>
              </div>
            </Card>
          );
        })}
      </div>
    </Card>
  );
}

function WorkspaceSection({ workspace }: { workspace: WorkspaceStats | null }) {
  if (!workspace) {
    return (
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Workspace Deliverability</h2>
        <p className="text-gray-500 text-sm">No workspace statistics available yet.</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold mb-4">Workspace Deliverability</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 border rounded-lg">
          <div className="text-sm text-gray-600">Bounce Rate</div>
          <div className="text-2xl font-bold mt-1">{formatPercent(workspace.bounce_rate)}</div>
        </div>
        <div className="p-4 border rounded-lg">
          <div className="text-sm text-gray-600">Spam Rate</div>
          <div className="text-2xl font-bold mt-1">{formatPercent(workspace.spam_rate)}</div>
        </div>
        <div className="p-4 border rounded-lg">
          <div className="text-sm text-gray-600">Avg Open Rate</div>
          <div className="text-2xl font-bold mt-1">{formatPercent(workspace.avg_open_rate)}</div>
        </div>
        <div className="p-4 border rounded-lg">
          <div className="text-sm text-gray-600">Avg Click Rate</div>
          <div className="text-2xl font-bold mt-1">{formatPercent(workspace.avg_click_rate)}</div>
        </div>
      </div>
    </Card>
  );
}

function AuditResultsSection({ audit }: { audit: AuditResult | null }) {
  if (!audit) return null;

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const List = ({ title, items }: { title: string; items: string[] }) => {
    if (!items || items.length === 0) return null;
    return (
      <div className="mt-4">
        <h3 className="font-semibold text-sm mb-2">{title}</h3>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-700">
          {items.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <Card className="p-6 space-y-4">
      <h2 className="text-xl font-semibold">AI Deliverability Audit</h2>
      
      <div className="flex items-center gap-4">
        <p className={`text-3xl font-bold ${getScoreColor(audit.score)}`}>
          {audit.score}/100
        </p>
        <div className="flex-1">
          <div className="w-full bg-gray-200 rounded-full h-4">
            <div
              className={`h-4 rounded-full ${
                audit.score >= 80
                  ? "bg-green-600"
                  : audit.score >= 60
                  ? "bg-yellow-600"
                  : "bg-red-600"
              }`}
              style={{ width: `${audit.score}%` }}
            />
          </div>
        </div>
      </div>

      <p className="text-gray-700">{audit.summary}</p>

      <List title="Warnings" items={audit.warnings} />
      <List title="Fixes" items={audit.fixes} />
      <List title="Warmup Recommendations" items={audit.warmup_recommendations} />
      <List title="DNS Fixes" items={audit.dns_fixes} />
      <List title="Campaign Fixes" items={audit.campaign_fixes} />

      {audit.recommended_window && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-sm mb-2">Recommended Sending Window</h3>
          <p className="text-sm text-gray-700">
            Days: {audit.recommended_window.days?.join(", ") || "N/A"}
          </p>
          <p className="text-sm text-gray-700">
            Time: {audit.recommended_window.start} - {audit.recommended_window.end}
          </p>
        </div>
      )}
    </Card>
  );
}

function AlertsSection({ domains, inboxes }: { domains: Domain[]; inboxes: Inbox[] }) {
  const alerts: Array<{ type: "error" | "warning"; message: string }> = [];

  // Domain alerts
  for (const domain of domains) {
    if (!domain.dkim_valid) {
      alerts.push({ type: "error", message: `❗ DKIM Missing for ${domain.domain}` });
    }
    if (!domain.spf_valid) {
      alerts.push({ type: "error", message: `❗ SPF Invalid for ${domain.domain}` });
    }
    if (!domain.dmarc_valid) {
      alerts.push({ type: "error", message: `❗ DMARC Missing for ${domain.domain}` });
    }
    if (!domain.mx_valid) {
      alerts.push({ type: "error", message: `❗ MX Invalid for ${domain.domain}` });
    }
  }

  // Inbox alerts
  for (const inbox of inboxes) {
    const health = inbox.inbox_health?.[0];
    if (health) {
      if (health.bounce_rate > 0.05) {
        alerts.push({
          type: "error",
          message: `❗ Bounce Rate Too High (${formatPercent(health.bounce_rate)}) for ${inbox.email}`,
        });
      }
      if (health.spam_rate > 0.005) {
        alerts.push({
          type: "error",
          message: `❗ Spam Rate Too High (${formatPercent(health.spam_rate)}) for ${inbox.email}`,
        });
      }
      if (health.open_rate < 0.2 && health.open_rate > 0) {
        alerts.push({
          type: "warning",
          message: `⚠ Open Rate Low (${formatPercent(health.open_rate)}) for ${inbox.email}`,
        });
      }
      if (inbox.warmup_enabled && health.warmup_stage < 7) {
        alerts.push({
          type: "warning",
          message: `⚠ Warmup Not Completed (Stage ${health.warmup_stage}/7) for ${inbox.email}`,
        });
      }
    }
  }

  // Workspace alerts (would need workspace stats)
  // These are handled in the WorkspaceSection component

  if (alerts.length === 0) {
    return (
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Alerts</h2>
        <p className="text-green-600 text-sm">✓ No alerts. Your deliverability looks healthy!</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold mb-4">Alerts</h2>
      <div className="space-y-2">
        {alerts.map((alert, idx) => (
          <div
            key={idx}
            className={`p-3 rounded-lg text-sm ${
              alert.type === "error"
                ? "bg-red-50 border border-red-200 text-red-800"
                : "bg-yellow-50 border border-yellow-200 text-yellow-800"
            }`}
          >
            {alert.message}
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function DeliverabilityDashboard() {
  const { data, error, isLoading } = useSWR<DeliverabilityData>(
    "/api/deliverability",
    fetcher,
    { refreshInterval: 60000 } // Refresh every minute
  );

  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  async function runAudit() {
    setAuditLoading(true);
    setAuditError(null);
    try {
      const res = await fetch("/api/ai/deliverability-coach", { method: "POST" });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to run audit");
      }
      const auditData = await res.json();
      setAudit(auditData);
    } catch (err: any) {
      setAuditError(err.message || "Failed to run audit");
      console.error("Audit error:", err);
    } finally {
      setAuditLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
            <p className="font-semibold">Error loading deliverability data</p>
            <p className="text-sm mt-1">Please refresh the page or try again later.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Deliverability Health</h1>
            <p className="text-gray-600">
              Monitor your domain reputation, inbox health, and sending metrics
            </p>
          </div>
          <Button
            onClick={runAudit}
            disabled={auditLoading}
            className="w-full sm:w-auto"
          >
            {auditLoading ? "Running Audit..." : "Run AI Deliverability Audit"}
          </Button>
        </div>

        {auditError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
            <p className="font-semibold">Error running audit</p>
            <p className="text-sm mt-1">{auditError}</p>
          </div>
        )}

        <AuditResultsSection audit={audit} />

        <DomainSection domains={data.domains} />
        <InboxSection inboxes={data.inboxes} />
        <WorkspaceSection workspace={data.workspace} />
        <AlertsSection domains={data.domains} inboxes={data.inboxes} />
      </div>
    </div>
  );
}

