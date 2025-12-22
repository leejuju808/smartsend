"use client";

import { useEffect, useState } from "react";
import { Button, Card, CardContent } from "@aurev/ui";

interface IntegrationMetrics {
  hubspot_orgs: number;
  notion_orgs: number;
  zapier_orgs: number;
  total_integration_orgs: number;
}

export default function Enterprise() {
  const [metrics, setMetrics] = useState<IntegrationMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMetrics() {
      try {
        const res = await fetch("/api/integration-metrics");
        if (!res.ok) throw new Error("Failed to fetch metrics");
        const json = await res.json();
        setMetrics(json);
      } catch (err) {
        console.error("Error fetching integration metrics:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchMetrics();
  }, []);

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <div className="text-center py-24 space-y-6">
        <h1 className="text-5xl font-bold text-amber-400">AUREV OS for Teams ⚡</h1>
        <p className="text-gray-400 max-w-2xl mx-auto">
          Outreach, operations, and AI agents — unified for your business.
        </p>
        <div className="space-x-4">
          <Button onClick={()=>window.location.href="/demo"}>Book Live Demo</Button>
          <Button variant="secondary" onClick={()=>window.location.href="/pricing"}>View Plans</Button>
        </div>
      </div>

      {/* Integration Adoption Metrics */}
      {!loading && metrics && (
        <div className="max-w-7xl mx-auto px-8 pb-16">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-white mb-2">Enterprise Integrations</h2>
            <p className="text-gray-400">
              Adoption metrics for HubSpot, Notion, and Zapier integrations
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            <Card className="p-6">
              <CardContent className="pt-0">
                <div className="text-center">
                  <div className="text-4xl font-bold text-brand-gold mb-2">
                    {metrics.hubspot_orgs}
                  </div>
                  <div className="text-sm text-gray-400">HubSpot Connected</div>
                  <div className="text-xs text-gray-500 mt-1">CRM Sync Active</div>
                </div>
              </CardContent>
            </Card>

            <Card className="p-6">
              <CardContent className="pt-0">
                <div className="text-center">
                  <div className="text-4xl font-bold text-brand-gold mb-2">
                    {metrics.notion_orgs}
                  </div>
                  <div className="text-sm text-gray-400">Notion Connected</div>
                  <div className="text-xs text-gray-500 mt-1">Auto-Reports Active</div>
                </div>
              </CardContent>
            </Card>

            <Card className="p-6">
              <CardContent className="pt-0">
                <div className="text-center">
                  <div className="text-4xl font-bold text-brand-gold mb-2">
                    {metrics.zapier_orgs}
                  </div>
                  <div className="text-sm text-gray-400">Zapier Connected</div>
                  <div className="text-xs text-gray-500 mt-1">5,000+ Apps Ready</div>
                </div>
              </CardContent>
            </Card>

            <Card className="p-6 border-2 border-brand-gold">
              <CardContent className="pt-0">
                <div className="text-center">
                  <div className="text-4xl font-bold text-brand-gold mb-2">
                    {metrics.total_integration_orgs}
                  </div>
                  <div className="text-sm text-gray-400">Total Integrations</div>
                  <div className="text-xs text-brand-gold mt-1 font-semibold">
                    Enterprise Enabled
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Quick Links */}
      <div className="max-w-4xl mx-auto px-8 pb-16">
        <div className="grid md:grid-cols-2 gap-6">
          <Button
            onClick={()=>window.location.href="/integrations"}
            className="h-auto py-6"
          >
            <div className="text-left">
              <div className="text-xl font-bold mb-1">Manage Integrations</div>
              <div className="text-sm opacity-80">Connect HubSpot, Notion, and Zapier</div>
            </div>
          </Button>
          <Button
            variant="secondary"
            onClick={()=>window.location.href="/case-studies"}
            className="h-auto py-6"
          >
            <div className="text-left">
              <div className="text-xl font-bold mb-1">Case Studies</div>
              <div className="text-sm opacity-80">See how teams use AUREV OS</div>
            </div>
          </Button>
        </div>
      </div>
    </div>
  );
}

