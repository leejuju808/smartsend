"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Copy,
  RefreshCw,
  Mail,
  Shield,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { generateDKIMPair } from "@/lib/domains";

type DomainSetting = {
  id: string;
  domain: string;
  sending_email: string;
  provider: string;
  spf_pass: boolean;
  dkim_pass: boolean;
  dmarc_pass: boolean;
  mx_pass: boolean;
  verification_status: "unverified" | "partial" | "verified";
  safe_mode: boolean;
  dkim_selector: string;
  dkim_public_key: string;
  last_verified_at: string | null;
  verification_errors: string[];
};

const PROVIDERS = [
  { value: "google_workspace", label: "Google Workspace" },
  { value: "microsoft_365", label: "Microsoft 365" },
  { value: "cpanel", label: "cPanel / GoDaddy" },
  { value: "godaddy", label: "GoDaddy" },
  { value: "namecheap", label: "Namecheap" },
  { value: "custom", label: "Custom Provider" },
];

export default function DomainSettingsPage() {
  const [domains, setDomains] = useState<DomainSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [formData, setFormData] = useState({
    sending_email: "",
    provider: "google_workspace",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadDomains();
  }, []);

  const loadDomains = async () => {
    try {
      const res = await fetch("/api/settings/domain");
      const data = await res.json();
      setDomains(data.domains || []);
    } catch (error) {
      console.error("Error loading domains:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (domainId: string) => {
    setVerifying(domainId);
    try {
      const res = await fetch("/api/settings/domain/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain_id: domainId }),
      });
      const result = await res.json();
      if (res.ok) {
        await loadDomains();
      } else {
        alert(`Verification failed: ${result.error}`);
      }
    } catch (error) {
      console.error("Error verifying domain:", error);
      alert("Failed to verify domain");
    } finally {
      setVerifying(null);
    }
  };

  const handleRegenerateDKIM = async (domainId: string) => {
    if (!confirm("Regenerating DKIM keys will require updating your DNS records. Continue?")) {
      return;
    }
    try {
      const res = await fetch("/api/settings/domain/regenerate-dkim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain_id: domainId }),
      });
      const result = await res.json();
      if (res.ok) {
        await loadDomains();
        alert("DKIM keys regenerated. Please update your DNS records.");
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error("Error regenerating DKIM:", error);
      alert("Failed to regenerate DKIM keys");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const domain = formData.sending_email.split("@")[1];
      const res = await fetch("/api/settings/domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain,
          sending_email: formData.sending_email,
          provider: formData.provider,
        }),
      });
      const result = await res.json();
      if (res.ok) {
        await loadDomains();
        setShowSetup(false);
        setFormData({ sending_email: "", provider: "google_workspace" });
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error("Error creating domain:", error);
      alert("Failed to create domain settings");
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getStatusBadge = (status: string, safeMode: boolean) => {
    if (status === "verified" && !safeMode) {
      return <Badge className="bg-green-500">Verified</Badge>;
    } else if (status === "partial") {
      return <Badge className="bg-yellow-500">Safe Mode</Badge>;
    } else {
      return <Badge className="bg-red-500">Unsafe</Badge>;
    }
  };

  const getProviderInstructions = (provider: string, domain: string, dkimPublicKey: string, selector: string) => {
    const baseInstructions = {
      spf: {
        type: "TXT",
        name: domain,
        value: `v=spf1 include:send.smartsendhq.com ~all`,
      },
      dkim: {
        type: "TXT",
        name: `${selector}._domainkey.${domain}`,
        value: `v=DKIM1; k=rsa; p=${dkimPublicKey}`,
      },
      dmarc: {
        type: "TXT",
        name: `_dmarc.${domain}`,
        value: `v=DMARC1; p=none; rua=mailto:dmarc@smartsendhq.com`,
      },
    };

    const providerSpecific: Record<string, any> = {
      google_workspace: {
        ...baseInstructions,
        note: "Go to Google Admin Console → Domains → DNS Settings → Add Record",
      },
      microsoft_365: {
        ...baseInstructions,
        note: "Go to Microsoft 365 Admin → Settings → Domains → DNS Records → Add Record",
      },
      cpanel: {
        ...baseInstructions,
        note: "Go to cPanel → Zone Editor → Add Record → Select TXT",
      },
      godaddy: {
        ...baseInstructions,
        note: "Go to GoDaddy → My Products → DNS → Add Record → Type: TXT",
      },
      namecheap: {
        ...baseInstructions,
        note: "Go to Namecheap → Domain List → Manage → Advanced DNS → Add Record",
      },
      custom: {
        ...baseInstructions,
        note: "Add these TXT records in your DNS provider's control panel",
      },
    };

    return providerSpecific[provider] || providerSpecific.custom;
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Domain Setup & Verification</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connect your domain to send verified, spam-resistant emails
          </p>
        </div>
        {domains.length === 0 && (
          <Button onClick={() => setShowSetup(true)}>
            <Mail className="h-4 w-4 mr-2" />
            Add Domain
          </Button>
        )}
      </div>

      {/* Setup Form */}
      {showSetup && (
        <Card>
          <CardHeader>
            <CardTitle>Add Sending Domain</CardTitle>
            <CardDescription>
              Enter your sending email address. SmartSend will guide you through DNS setup.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="sending_email">Sending Email Address</Label>
                <Input
                  id="sending_email"
                  type="email"
                  placeholder="estimates@roofingcompany.com"
                  value={formData.sending_email}
                  onChange={(e) => setFormData({ ...formData, sending_email: e.target.value })}
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This is the email address you'll send from
                </p>
              </div>

              <div>
                <Label htmlFor="provider">Email Provider</Label>
                <Select
                  value={formData.provider}
                  onValueChange={(value) => setFormData({ ...formData, provider: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Where you manage your domain DNS
                </p>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Continue Setup
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowSetup(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Domain List */}
      {domains.map((domain) => {
        const instructions = getProviderInstructions(
          domain.provider,
          domain.domain,
          domain.dkim_public_key,
          domain.dkim_selector || "smartsend"
        );

        return (
          <Card key={domain.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {domain.sending_email}
                    {getStatusBadge(domain.verification_status, domain.safe_mode)}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Domain: {domain.domain} • Provider: {PROVIDERS.find((p) => p.value === domain.provider)?.label || domain.provider}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleVerify(domain.id)}
                    disabled={verifying === domain.id}
                  >
                    {verifying === domain.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Re-Verify
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Verification Status */}
              <div>
                <h3 className="text-sm font-medium mb-3">Verification Status</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex items-center gap-2">
                    {domain.spf_pass ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <span className="text-sm">SPF</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {domain.dkim_pass ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <span className="text-sm">DKIM</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {domain.dmarc_pass ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <span className="text-sm">DMARC</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {domain.mx_pass ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <span className="text-sm">MX</span>
                  </div>
                </div>
              </div>

              {/* DNS Instructions */}
              {domain.verification_status !== "verified" && (
                <div className="border-t pt-6">
                  <h3 className="text-sm font-medium mb-3">DNS Setup Instructions</h3>
                  <p className="text-xs text-muted-foreground mb-4">{instructions.note}</p>

                  {/* SPF */}
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">SPF Record</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(instructions.spf.value)}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy
                      </Button>
                    </div>
                    <div className="bg-muted p-3 rounded-md text-xs font-mono break-all">
                      <div className="text-muted-foreground">Type: {instructions.spf.type}</div>
                      <div className="text-muted-foreground">Name: {instructions.spf.name}</div>
                      <div className="mt-1">Value: {instructions.spf.value}</div>
                    </div>
                  </div>

                  {/* DKIM */}
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">DKIM Record</Label>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(instructions.dkim.value)}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copy Value
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRegenerateDKIM(domain.id)}
                        >
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Regenerate
                        </Button>
                      </div>
                    </div>
                    <div className="bg-muted p-3 rounded-md text-xs font-mono break-all">
                      <div className="text-muted-foreground">Type: {instructions.dkim.type}</div>
                      <div className="text-muted-foreground">Name: {instructions.dkim.name}</div>
                      <div className="mt-1">Value: {instructions.dkim.value}</div>
                    </div>
                  </div>

                  {/* DMARC */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">DMARC Record (Optional)</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(instructions.dmarc.value)}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy
                      </Button>
                    </div>
                    <div className="bg-muted p-3 rounded-md text-xs font-mono break-all">
                      <div className="text-muted-foreground">Type: {instructions.dmarc.type}</div>
                      <div className="text-muted-foreground">Name: {instructions.dmarc.name}</div>
                      <div className="mt-1">Value: {instructions.dmarc.value}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Safe Mode Notice */}
              {domain.safe_mode && (
                <div className="border-t pt-4">
                  <div className="flex items-start gap-2 bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-md">
                    <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                    <div className="text-sm">
                      <div className="font-medium text-yellow-900 dark:text-yellow-100">
                        Safe Mode Enabled
                      </div>
                      <div className="text-yellow-700 dark:text-yellow-300 mt-1">
                        Your domain is protected with safe sending limits (max 20 emails/day) until
                        verification is complete. This prevents domain reputation issues.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Verified Notice */}
              {domain.verification_status === "verified" && !domain.safe_mode && (
                <div className="border-t pt-4">
                  <div className="flex items-start gap-2 bg-green-50 dark:bg-green-900/20 p-3 rounded-md">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                    <div className="text-sm">
                      <div className="font-medium text-green-900 dark:text-green-100">
                        Verified — High Deliverability Enabled
                      </div>
                      <div className="text-green-700 dark:text-green-300 mt-1">
                        Your domain is fully verified. You can send at full capacity with maximum
                        deliverability.
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {domains.length === 0 && !showSetup && (
        <Card>
          <CardContent className="py-12 text-center">
            <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No domains configured</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Connect your domain to start sending verified emails
            </p>
            <Button onClick={() => setShowSetup(true)}>Add Domain</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

