"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Badge } from "@/components/ui/Badge";

type Domain = {
  id: string;
  domain: string;
  spf_valid: boolean;
  dkim_valid: boolean;
  dmarc_valid: boolean;
  mx_valid: boolean;
  health: "excellent" | "good" | "poor";
  last_check: string | null;
};

export default function DomainsSection() {
  const [domains, setDomains] = React.useState<Domain[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [adding, setAdding] = React.useState(false);
  const [checking, setChecking] = React.useState<string | null>(null);
  const [newDomain, setNewDomain] = React.useState("");

  const loadDomains = React.useCallback(async () => {
    try {
      const response = await fetch("/api/domains/list");
      if (!response.ok) throw new Error("Failed to load domains");
      const data = await response.json();
      setDomains(data.domains || []);
    } catch (error: any) {
      toast.error(error.message || "Failed to load domains");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadDomains();
  }, [loadDomains]);

  const addDomain = async () => {
    if (!newDomain.trim()) {
      toast.error("Please enter a domain");
      return;
    }

    setAdding(true);
    try {
      const response = await fetch("/api/domains/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: newDomain.trim() }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to add domain");
      }

      toast.success("Domain added successfully");
      setNewDomain("");
      loadDomains();
    } catch (error: any) {
      toast.error(error.message || "Failed to add domain");
    } finally {
      setAdding(false);
    }
  };

  const checkDNS = async (domain: string) => {
    setChecking(domain);
    try {
      const response = await fetch("/api/domains/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "DNS check failed");
      }

      toast.success("DNS records checked");
      loadDomains();
    } catch (error: any) {
      toast.error(error.message || "DNS check failed");
    } finally {
      setChecking(null);
    }
  };

  const getHealthColor = (health: string) => {
    switch (health) {
      case "excellent":
        return "bg-green-500";
      case "good":
        return "bg-yellow-500";
      default:
        return "bg-red-500";
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">Loading domains...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Domains</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="acmeemail.com"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addDomain();
            }}
          />
          <Button onClick={addDomain} disabled={adding}>
            {adding ? "Adding..." : "Add Domain"}
          </Button>
        </div>

        {domains.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No domains added yet. Add your first domain to get started.
          </p>
        ) : (
          <div className="space-y-3">
            {domains.map((domain) => (
              <div
                key={domain.id}
                className="flex items-center justify-between border rounded-lg p-4"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{domain.domain}</span>
                    <Badge
                      className={`${getHealthColor(domain.health)} text-white`}
                      variant="default"
                    >
                      {domain.health}
                    </Badge>
                  </div>
                  <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                    <span>
                      SPF: {domain.spf_valid ? "✓" : "✗"}
                    </span>
                    <span>
                      DKIM: {domain.dkim_valid ? "✓" : "✗"}
                    </span>
                    <span>
                      DMARC: {domain.dmarc_valid ? "✓" : "✗"}
                    </span>
                    <span>
                      MX: {domain.mx_valid ? "✓" : "✗"}
                    </span>
                    {domain.last_check && (
                      <span>
                        Last checked:{" "}
                        {new Date(domain.last_check).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => checkDNS(domain.domain)}
                  disabled={checking === domain.domain}
                >
                  {checking === domain.domain ? "Checking..." : "Re-check DNS"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

