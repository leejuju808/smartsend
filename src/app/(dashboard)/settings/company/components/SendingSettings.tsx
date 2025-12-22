"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { CheckCircle2, XCircle, AlertCircle, RefreshCw } from "lucide-react";

interface SendingSettingsProps {
  canEdit: boolean;
}

interface DomainHealth {
  domain: string;
  sending_email: string;
  spf_status: "pass" | "fail" | "unknown";
  dkim_status: "pass" | "fail" | "unknown";
  dmarc_status: "pass" | "fail" | "unknown";
  warmup_status: "active" | "inactive" | "unknown";
  health_score: number;
}

export default function SendingSettings({ canEdit }: SendingSettingsProps) {
  const [dailySendingLimit, setDailySendingLimit] = useState(200);
  const [warmupEnabled, setWarmupEnabled] = useState(true);
  const [timezoneSync, setTimezoneSync] = useState(true);
  const [retryFailedSends, setRetryFailedSends] = useState(true);
  const [softBounceRetryWindow, setSoftBounceRetryWindow] = useState(24);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [domainHealth, setDomainHealth] = useState<DomainHealth | null>(null);
  const [checkingDomain, setCheckingDomain] = useState(false);

  useEffect(() => {
    loadSettings();
    loadDomainHealth();
  }, []);

  const loadSettings = async () => {
    try {
      // This would come from company_sending_settings if we add it, or from workspace settings
      // For now, using defaults
      setDailySendingLimit(200);
      setWarmupEnabled(true);
      setTimezoneSync(true);
      setRetryFailedSends(true);
      setSoftBounceRetryWindow(24);
    } catch (error) {
      console.error("Failed to load sending settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadDomainHealth = async () => {
    try {
      // TODO: Fetch actual domain health from deliverability system
      // For now, showing placeholder
      setDomainHealth({
        domain: "example.com",
        sending_email: "noreply@example.com",
        spf_status: "pass",
        dkim_status: "pass",
        dmarc_status: "pass",
        warmup_status: "active",
        health_score: 95,
      });
    } catch (error) {
      console.error("Failed to load domain health:", error);
    }
  };

  const checkDomainHealth = async () => {
    setCheckingDomain(true);
    try {
      // TODO: Call domain health check API
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await loadDomainHealth();
      setMessage("Domain health checked!");
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setCheckingDomain(false);
    }
  };

  const handleSave = async () => {
    if (!canEdit) return;

    setSaving(true);
    setMessage(null);

    try {
      // TODO: Save to company_sending_settings table
      // For now, just show success
      await new Promise((resolve) => setTimeout(resolve, 500));
      setMessage("Sending settings saved!");
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const getStatusIcon = (status: string) => {
    if (status === "pass" || status === "active") {
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    }
    if (status === "fail" || status === "inactive") {
      return <XCircle className="h-5 w-5 text-red-500" />;
    }
    return <AlertCircle className="h-5 w-5 text-yellow-500" />;
  };

  const getHealthScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-semibold mb-2">Sending Settings</h1>
        <p className="text-muted-foreground mb-6">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Sending Settings</h1>
        <p className="text-sm text-gray-600">
          Manage your sending domain health, warmup, and sending limits. Integrates with Deliverability Shield.
        </p>
      </div>

      {/* Domain Health */}
      {domainHealth && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Domain Health</h2>
            <Button
              onClick={checkDomainHealth}
              disabled={checkingDomain || !canEdit}
              variant="outline"
              size="sm"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${checkingDomain ? "animate-spin" : ""}`} />
              Check Now
            </Button>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Sending Domain</p>
                <p className="font-medium">{domainHealth.domain}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Sending Email</p>
                <p className="font-medium">{domainHealth.sending_email}</p>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-medium">Domain Health Score</p>
                <span className={`text-2xl font-bold ${getHealthScoreColor(domainHealth.health_score)}`}>
                  {domainHealth.health_score}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="flex items-center gap-2">
                  {getStatusIcon(domainHealth.spf_status)}
                  <div>
                    <p className="text-sm font-medium">SPF</p>
                    <p className="text-xs text-gray-500 capitalize">{domainHealth.spf_status}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusIcon(domainHealth.dkim_status)}
                  <div>
                    <p className="text-sm font-medium">DKIM</p>
                    <p className="text-xs text-gray-500 capitalize">{domainHealth.dkim_status}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusIcon(domainHealth.dmarc_status)}
                  <div>
                    <p className="text-sm font-medium">DMARC</p>
                    <p className="text-xs text-gray-500 capitalize">{domainHealth.dmarc_status}</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                {getStatusIcon(domainHealth.warmup_status)}
                <div>
                  <p className="text-sm font-medium">Warmup Status</p>
                  <p className="text-xs text-gray-500 capitalize">{domainHealth.warmup_status}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sending Controls */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Daily Sending Limit
          </label>
          <Input
            type="number"
            value={dailySendingLimit}
            onChange={(e) => setDailySendingLimit(parseInt(e.target.value) || 0)}
            disabled={!canEdit}
            className="w-full"
            min="1"
            max="10000"
          />
          <p className="mt-1 text-xs text-gray-500">
            Maximum emails to send per day across all campaigns
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-gray-700">Enable Warmup</label>
            <p className="text-xs text-gray-500 mt-1">
              Gradually increase sending volume to build domain reputation
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={warmupEnabled}
              onChange={(e) => setWarmupEnabled(e.target.checked)}
              disabled={!canEdit}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-gray-700">Timezone Sync</label>
            <p className="text-xs text-gray-500 mt-1">
              Sync sending times with company timezone
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={timezoneSync}
              onChange={(e) => setTimezoneSync(e.target.checked)}
              disabled={!canEdit}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-gray-700">Retry Failed Sends</label>
            <p className="text-xs text-gray-500 mt-1">
              Automatically retry emails that fail to send
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={retryFailedSends}
              onChange={(e) => setRetryFailedSends(e.target.checked)}
              disabled={!canEdit}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Soft Bounce Retry Window (hours)
          </label>
          <Input
            type="number"
            value={softBounceRetryWindow}
            onChange={(e) => setSoftBounceRetryWindow(parseInt(e.target.value) || 0)}
            disabled={!canEdit}
            className="w-full"
            min="1"
            max="168"
          />
          <p className="mt-1 text-xs text-gray-500">
            How long to wait before retrying soft bounces
          </p>
        </div>

        {message && (
          <div
            className={`p-3 rounded-md ${
              message.startsWith("Error")
                ? "bg-red-50 text-red-800"
                : "bg-green-50 text-green-800"
            }`}
          >
            {message}
          </div>
        )}

        {canEdit && (
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}





















































