"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Shield, AlertTriangle, CheckCircle } from "lucide-react";

interface SendingDomainsSettingsProps {
  canEdit: boolean;
}

export default function SendingDomainsSettings({ canEdit }: SendingDomainsSettingsProps) {
  const [connectedDomain, setConnectedDomain] = useState("");
  const [dnsInstructions, setDnsInstructions] = useState("");
  const [spfRecord, setSpfRecord] = useState("");
  const [dkimRecord, setDkimRecord] = useState("");
  const [dmarcRecord, setDmarcRecord] = useState("");
  const [domainHealthScore, setDomainHealthScore] = useState(0);
  const [warmupProgress, setWarmupProgress] = useState(0);
  const [sendRateCap, setSendRateCap] = useState(50);
  const [bounceRate, setBounceRate] = useState(0);
  const [spamComplaintRate, setSpamComplaintRate] = useState(0);
  const [repairDomainEnabled, setRepairDomainEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch("/api/settings/domains");
      const data = await res.json();
      
      if (data.settings?.domains) {
        const domains = data.settings.domains;
        setConnectedDomain(domains.connected_domain || "");
        setDnsInstructions(domains.dns_instructions || "");
        setSpfRecord(domains.spf_record || "");
        setDkimRecord(domains.dkim_record || "");
        setDmarcRecord(domains.dmarc_record || "");
        setDomainHealthScore(domains.domain_health_score || 0);
        setWarmupProgress(domains.warmup_progress || 0);
        setSendRateCap(domains.send_rate_cap || 50);
        setBounceRate(domains.bounce_rate || 0);
        setSpamComplaintRate(domains.spam_complaint_rate || 0);
        setRepairDomainEnabled(domains.repair_domain_enabled || false);
      }
    } catch (error) {
      console.error("Failed to load domain settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!canEdit) return;

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/settings/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domains: {
            connected_domain: connectedDomain || null,
            dns_instructions: dnsInstructions || null,
            spf_record: spfRecord || null,
            dkim_record: dkimRecord || null,
            dmarc_record: dmarcRecord || null,
            send_rate_cap: sendRateCap,
            repair_domain_enabled: repairDomainEnabled,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Save failed");
      }

      setMessage("Domain settings updated!");
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-semibold mb-2">Sending Domains</h1>
        <p className="text-muted-foreground mb-6">Loading...</p>
      </div>
    );
  }

  const healthColor = domainHealthScore >= 80 ? "text-green-600" : domainHealthScore >= 50 ? "text-yellow-600" : "text-red-600";
  const healthIcon = domainHealthScore >= 80 ? CheckCircle : domainHealthScore >= 50 ? AlertTriangle : Shield;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Sending Domains</h1>
        <p className="text-sm text-gray-600">
          Elite-level domain safety controls: DNS, SPF, DKIM, DMARC, and health monitoring
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Connected Domain <span className="text-red-500">*</span>
          </label>
          <Input
            value={connectedDomain}
            onChange={(e) => setConnectedDomain(e.target.value)}
            placeholder="roofingcompany.com"
            disabled={!canEdit}
          />
          <p className="mt-1 text-xs text-gray-500">
            Your verified sending domain
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            DNS Instructions
          </label>
          <textarea
            value={dnsInstructions}
            onChange={(e) => setDnsInstructions(e.target.value)}
            disabled={!canEdit}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            placeholder="Add these DNS records to your domain..."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              SPF Record
            </label>
            <Input
              value={spfRecord}
              onChange={(e) => setSpfRecord(e.target.value)}
              placeholder="v=spf1 include:_spf.smartsend.ai ~all"
              disabled={!canEdit}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              DKIM Record
            </label>
            <Input
              value={dkimRecord}
              onChange={(e) => setDkimRecord(e.target.value)}
              placeholder="smartsend._domainkey"
              disabled={!canEdit}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              DMARC Record
            </label>
            <Input
              value={dmarcRecord}
              onChange={(e) => setDmarcRecord(e.target.value)}
              placeholder="v=DMARC1; p=quarantine"
              disabled={!canEdit}
            />
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Domain Health Score</span>
            <div className={`flex items-center gap-2 ${healthColor}`}>
              {domainHealthScore >= 80 ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              <span className="font-semibold">{domainHealthScore}%</span>
            </div>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${
                domainHealthScore >= 80 ? "bg-green-500" : domainHealthScore >= 50 ? "bg-yellow-500" : "bg-red-500"
              }`}
              style={{ width: `${domainHealthScore}%` }}
            />
          </div>
          {domainHealthScore < 50 && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Your domain health is LOW — recommended: pause campaigns
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Warmup Progress
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full"
                  style={{ width: `${warmupProgress}%` }}
                />
              </div>
              <span className="text-sm text-gray-600">{warmupProgress}%</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Send Rate Cap (per day)
            </label>
            <Input
              type="number"
              value={sendRateCap}
              onChange={(e) => setSendRateCap(parseInt(e.target.value) || 0)}
              disabled={!canEdit}
              min={1}
              max={1000}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Bounce Rate (%)
            </label>
            <Input
              type="number"
              step="0.01"
              value={bounceRate}
              onChange={(e) => setBounceRate(parseFloat(e.target.value) || 0)}
              disabled={!canEdit}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Spam Complaint Rate (%)
            </label>
            <Input
              type="number"
              step="0.01"
              value={spamComplaintRate}
              onChange={(e) => setSpamComplaintRate(parseFloat(e.target.value) || 0)}
              disabled={!canEdit}
            />
          </div>
        </div>

        {canEdit && (
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={repairDomainEnabled}
                onChange={(e) => setRepairDomainEnabled(e.target.checked)}
                className="rounded"
              />
              <label className="text-sm text-gray-700">Enable Repair Domain</label>
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        )}

        {message && (
          <div
            className={`p-3 rounded-lg ${
              message.startsWith("Error")
                ? "bg-red-50 text-red-700"
                : "bg-green-50 text-green-700"
            }`}
          >
            {message}
          </div>
        )}
      </div>
    </div>
  );
}





















































