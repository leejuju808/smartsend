"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@aurev/ui";
import { Button } from "@aurev/ui";

interface Integration {
  id: string;
  type: string;
  config: any;
  connected: boolean;
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch current integrations status
    fetch("/api/integrations")
      .then((res) => res.json())
      .then((data) => {
        setIntegrations(data);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Error fetching integrations:", error);
        setLoading(false);
      });
  }, []);

  const getIntegrationStatus = (type: string) => {
    const integration = integrations.find((i) => i.type === type);
    return integration ? integration.connected : false;
  };

  const handleConnect = (provider: string) => {
    if (provider === "hubspot") {
      window.location.href = "/api/integrations/hubspot/start";
    } else if (provider === "notion") {
      window.location.href = "/api/oauth/notion/start";
    } else if (provider === "zapier") {
      window.location.href = "/api/oauth/zapier/start";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface via-surface to-brand-black">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12 text-center">
            <h1 className="text-5xl font-bold text-white mb-4">
              Enterprise Integrations
            </h1>
            <p className="text-xl text-gray-400">
              Connect AUREV OS with the tools your enterprise customers already use
            </p>
          </div>

          {loading ? (
            <div className="text-center text-gray-400">Loading integrations...</div>
          ) : (
            <div className="grid md:grid-cols-3 gap-6">
              {/* HubSpot Integration */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between mb-2">
                    <CardTitle className="text-2xl">HubSpot CRM</CardTitle>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        getIntegrationStatus("hubspot")
                          ? "bg-green-500/20 text-green-400"
                          : "bg-gray-800 text-gray-400"
                      }`}
                    >
                      {getIntegrationStatus("hubspot") ? "Connected" : "Disconnected"}
                    </span>
                  </div>
                  <CardDescription>
                    Sync contacts & deals automatically. Push SmartSend leads directly into
                    your HubSpot pipelines.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 text-sm text-gray-400">
                    <div className="flex items-center gap-2">
                      <span className="text-brand-gold">✓</span>
                      <span>Bi-directional contact sync</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-brand-gold">✓</span>
                      <span>Deal creation & tracking</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-brand-gold">✓</span>
                      <span>Activity logging</span>
                    </div>
                  </div>
                  {getIntegrationStatus("hubspot") ? (
                    <Button variant="secondary" className="w-full">
                      Manage Connection
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleConnect("hubspot")}
                      className="w-full"
                    >
                      Connect HubSpot
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Notion Integration */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between mb-2">
                    <CardTitle className="text-2xl">Notion Reports</CardTitle>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        getIntegrationStatus("notion")
                          ? "bg-green-500/20 text-green-400"
                          : "bg-gray-800 text-gray-400"
                      }`}
                    >
                      {getIntegrationStatus("notion") ? "Connected" : "Disconnected"}
                    </span>
                  </div>
                  <CardDescription>
                    Auto-generate campaign documentation and reports in your Notion
                    workspace.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 text-sm text-gray-400">
                    <div className="flex items-center gap-2">
                      <span className="text-brand-gold">✓</span>
                      <span>Campaign summaries</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-brand-gold">✓</span>
                      <span>Performance metrics</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-brand-gold">✓</span>
                      <span>Real-time updates</span>
                    </div>
                  </div>
                  {getIntegrationStatus("notion") ? (
                    <Button variant="secondary" className="w-full">
                      Manage Connection
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleConnect("notion")}
                      className="w-full"
                    >
                      Connect Notion
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Zapier Integration */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between mb-2">
                    <CardTitle className="text-2xl">Zapier</CardTitle>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        getIntegrationStatus("zapier")
                          ? "bg-green-500/20 text-green-400"
                          : "bg-gray-800 text-gray-400"
                      }`}
                    >
                      {getIntegrationStatus("zapier") ? "Connected" : "Disconnected"}
                    </span>
                  </div>
                  <CardDescription>
                    Trigger automations across 5,000+ apps. Connect AUREV with your entire
                    stack.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 text-sm text-gray-400">
                    <div className="flex items-center gap-2">
                      <span className="text-brand-gold">✓</span>
                      <span>New Lead Imported trigger</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-brand-gold">✓</span>
                      <span>Campaign Sent trigger</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-brand-gold">✓</span>
                      <span>Workflow Completed trigger</span>
                    </div>
                  </div>
                  {getIntegrationStatus("zapier") ? (
                    <Button variant="secondary" className="w-full">
                      Manage Zaps
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleConnect("zapier")}
                      className="w-full"
                    >
                      Connect Zapier
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Stats Section */}
          <div className="mt-16 grid md:grid-cols-3 gap-6">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-4xl font-bold text-brand-gold mb-2">300+</div>
                  <div className="text-gray-400">Enterprise Orgs Enabled</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-4xl font-bold text-brand-gold mb-2">$2,000+</div>
                  <div className="text-gray-400">Avg MRR per Org</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-4xl font-bold text-brand-gold mb-2">+40%</div>
                  <div className="text-gray-400">Close Rate Boost</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
