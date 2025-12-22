"use client";

import { use } from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/src/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function SenderWarmupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: senderId } = use(params);
  const { data, mutate, isLoading } = useSWR(
    `/api/senders/${senderId}/warmup`,
    fetcher
  );
  const { data: healthData, mutate: mutateHealth } = useSWR(
    `/api/senders/${senderId}/domain-health`,
    fetcher
  );

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="text-red-600">Failed to load warmup data</div>
      </div>
    );
  }

  const { sender, logs } = data;

  if (!sender) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="text-red-600">Sender not found</div>
        <Link href="/settings/senders">
          <Button variant="outline" className="mt-4">
            Back to Senders
          </Button>
        </Link>
      </div>
    );
  }

  async function updateField(field: string, value: any) {
    await fetch(`/api/senders/${senderId}/warmup/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    mutate();
  }

  async function rescanDomain() {
    if (!healthData?.domain) return;
    await fetch("/api/domain/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: healthData.domain }),
    });
    mutateHealth();
  }

  // Check domain age (if domain_created_at exists)
  const domainAgeDays =
    sender.domain_created_at
      ? Math.floor(
          (new Date().getTime() - new Date(sender.domain_created_at).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : null;

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/settings/senders">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">Warmup Overview</h1>
          <p className="text-sm text-muted-foreground">{sender.from_email}</p>
        </div>
      </div>

      {/* Domain Health Card */}
      {healthData?.domain && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Domain Health</CardTitle>
              <Button
                size="sm"
                onClick={rescanDomain}
                disabled={!healthData.domain}
              >
                Rescan
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {healthData.health ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Last scanned:{" "}
                  {healthData.health.last_scanned_at
                    ? format(
                        new Date(healthData.health.last_scanned_at),
                        "PPP p"
                      )
                    : "Never"}
                </p>

                {/* Reputation Bar */}
                <div className="p-4 rounded-md bg-muted flex items-center gap-4">
                  <div className="text-3xl font-bold">
                    {healthData.health.reputation_score ?? 50}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Reputation Score
                  </div>
                </div>

                {/* DNS Checks */}
                <div className="grid grid-cols-2 gap-4 pt-4">
                  <DomainStatus
                    label="SPF"
                    good={healthData.health.spf_valid}
                  />
                  <DomainStatus
                    label="DKIM"
                    good={healthData.health.dkim_valid}
                  />
                  <DomainStatus
                    label="DMARC"
                    good={healthData.health.dmarc_valid}
                  />
                  <DomainStatus label="MX" good={healthData.health.mx_valid} />
                </div>

                {/* Domain Age */}
                <div className="pt-2 text-sm">
                  Domain age:{" "}
                  {healthData.health.domain_age_days
                    ? `${healthData.health.domain_age_days} days`
                    : "N/A"}
                </div>

                {/* DMARC Policy */}
                {healthData.health.dmarc_policy && (
                  <div className="pt-2 text-sm">
                    DMARC Policy:{" "}
                    <span className="font-medium">
                      {healthData.health.dmarc_policy}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-muted-foreground">
                No health data yet. Click "Rescan" to scan this domain.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Warmup Status Card */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Warmup Status</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {sender.warmup_enabled ? "ON" : "OFF"}
              </span>
              <Switch
                checked={sender.warmup_enabled ?? false}
                onCheckedChange={(v) => updateField("warmup_enabled", v)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {/* Reputation */}
            <div className="p-4 bg-muted rounded-md text-center">
              <div className="text-3xl font-bold">
                {sender.warmup_reputation ?? 50}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Reputation</p>
            </div>

            {/* Daily Volume */}
            <div className="p-4 bg-muted rounded-md text-center">
              <Input
                type="number"
                className="text-center font-medium text-lg"
                defaultValue={sender.warmup_daily_volume ?? 20}
                onBlur={(e) =>
                  updateField("warmup_daily_volume", Number(e.target.value))
                }
              />
              <p className="text-xs text-muted-foreground mt-1">
                Daily Volume
              </p>
            </div>

            {/* Last Event */}
            <div className="p-4 bg-muted rounded-md text-center">
              <div className="text-sm font-medium">
                {sender.warmup_last_event
                  ? format(new Date(sender.warmup_last_event), "PPP p")
                  : "N/A"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Last Event</p>
            </div>
          </div>

          {/* Reputation State */}
          <div className="flex items-center gap-2">
            {sender.warmup_reputation >= 80 && (
              <Badge className="bg-green-600 text-white">Healthy</Badge>
            )}
            {sender.warmup_reputation >= 50 &&
              sender.warmup_reputation < 80 && (
                <Badge className="bg-yellow-500 text-white">Moderate</Badge>
              )}
            {sender.warmup_reputation < 50 && (
              <Badge className="bg-red-600 text-white">Poor Reputation</Badge>
            )}
          </div>

          {/* Troubleshooting Indicators */}
          <div className="pt-4 border-t space-y-2">
            <h3 className="text-sm font-semibold mb-2">
              Troubleshooting Indicators
            </h3>
            <div className="flex flex-wrap gap-2">
              {sender.spf_valid === false && (
                <Badge variant="destructive">SPF Missing</Badge>
              )}
              {sender.dkim_valid === false && (
                <Badge variant="destructive">DKIM Missing</Badge>
              )}
              {sender.dmarc_valid === false && (
                <Badge variant="destructive">DMARC Missing</Badge>
              )}
              {domainAgeDays !== null && domainAgeDays < 14 && (
                <Badge variant="destructive">
                  Domain Age: {domainAgeDays} days (recommended: 14+)
                </Badge>
              )}
              {sender.warmup_reputation < 40 && (
                <Badge variant="destructive">
                  Reputation unhealthy — recommended daily volume:{" "}
                  {Math.max(5, Math.floor((sender.warmup_reputation ?? 50) / 10))}
                </Badge>
              )}
              {sender.spf_valid !== false &&
                sender.dkim_valid !== false &&
                sender.dmarc_valid !== false &&
                (domainAgeDays === null || domainAgeDays >= 14) &&
                sender.warmup_reputation >= 40 && (
                  <Badge className="bg-green-600 text-white">
                    All checks passed
                  </Badge>
                )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logs */}
      <Card>
        <CardHeader>
          <CardTitle>Warmup Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {logs && logs.length > 0 ? (
              logs.map((log: any) => (
                <div
                  key={log.id}
                  className="flex justify-between items-center text-sm py-2 border-b last:border-b-0"
                >
                  <span>
                    {renderWarmupLog(log.event_type)} — {log.details || "No details"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(log.created_at), "PPP p")}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No logs yet.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DomainStatus({ label, good }: { label: string; good?: boolean }) {
  return (
    <div className="p-3 rounded-md bg-muted flex justify-between">
      <span>{label}</span>
      <span className={good ? "text-green-600" : "text-red-600"}>
        {good ? "OK" : "Issue"}
      </span>
    </div>
  );
}

function renderWarmupLog(type: string) {
  switch (type) {
    case "warmup_sent":
      return "Warmup Sent";
    case "warmup_received":
      return "Warmup Received";
    case "reputation_gain":
      return "Reputation Gain";
    case "reputation_loss":
      return "Reputation Loss";
    default:
      return "System Event";
  }
}

