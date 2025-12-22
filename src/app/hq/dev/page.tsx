"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, Copy, ExternalLink, Zap, Shield, BookOpen } from "lucide-react";

interface ApiKey {
  id: string;
  label: string;
  api_key: string;
  status: "active" | "revoked";
  last_used_at?: string;
  created_at: string;
}

interface Integration {
  id: string;
  service_name: string;
  display_name: string;
  description: string;
  category: string;
  is_active: boolean;
  connected: boolean;
}

export default function DeveloperPortal() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    loadApiKeys();
    loadIntegrations();
  }, []);

  async function loadApiKeys() {
    try {
      const res = await fetch("/api/hq/partner-keys");
      const data = await res.json();
      setApiKeys(data.keys || []);
    } catch (error) {
      console.error("Failed to load API keys:", error);
    }
  }

  async function loadIntegrations() {
    try {
      const res = await fetch("/api/hq/integrations/available");
      const data = await res.json();
      setIntegrations(data.integrations || []);
    } catch (error) {
      console.error("Failed to load integrations:", error);
    }
  }

  async function createApiKey() {
    if (!newKeyLabel.trim()) return;
    
    setCreatingKey(true);
    try {
      const res = await fetch("/api/hq/partner-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newKeyLabel.trim() }),
      });
      
      const data = await res.json();
      
      if (data.key) {
        setApiKeys([...apiKeys, data.key]);
        setNewKeyLabel("");
        alert(`API Key Created!\n\n${data.key.api_key}\n\nPlease copy this key now - it won't be shown again!`);
      }
    } catch (error) {
      console.error("Failed to create API key:", error);
      alert("Failed to create API key. Please try again.");
    } finally {
      setCreatingKey(false);
    }
  }

  async function revokeKey(id: string) {
    if (!confirm("Are you sure you want to revoke this API key?")) return;
    
    try {
      const res = await fetch("/api/hq/partner-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      
      if (res.ok) {
        setApiKeys(apiKeys.filter((k) => k.id !== id));
      }
    } catch (error) {
      console.error("Failed to revoke API key:", error);
    }
  }

  async function connectIntegration(serviceName: string) {
    try {
      const res = await fetch(`/api/hq/integrations/${serviceName}?action=auth`);
      const data = await res.json();
      
      if (data.oauth_url) {
        window.location.href = data.oauth_url;
      }
    } catch (error) {
      console.error("Failed to connect integration:", error);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(text);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-950 to-black text-white p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-yellow-500/20 rounded-lg">
              <Zap className="h-8 w-8 text-yellow-500" />
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">
                AUREV HQ Developer Portal
              </h1>
              <p className="text-gray-400">
                Build powerful integrations with SmartSend, OpsGrid, and AgentCloud
              </p>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid md:grid-cols-3 gap-6">
          <Card className="bg-gray-900/50 border-gray-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">API Keys</p>
                  <p className="text-3xl font-bold text-yellow-500">{apiKeys.length}</p>
                </div>
                <Shield className="h-8 w-8 text-yellow-500/50" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gray-900/50 border-gray-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Integrations</p>
                  <p className="text-3xl font-bold text-yellow-500">{integrations.length}</p>
                </div>
                <Zap className="h-8 w-8 text-yellow-500/50" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gray-900/50 border-gray-800">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Active Connections</p>
                  <p className="text-3xl font-bold text-yellow-500">
                    {integrations.filter((i) => i.connected).length}
                  </p>
                </div>
                <CheckCircle className="h-8 w-8 text-yellow-500/50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="api-keys" className="space-y-6">
          <TabsList className="bg-gray-900/50 border border-gray-800">
            <TabsTrigger value="api-keys">API Keys</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="docs">Documentation</TabsTrigger>
          </TabsList>

          {/* API Keys Tab */}
          <TabsContent value="api-keys" className="space-y-6">
            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader>
                <CardTitle>Partner API Keys</CardTitle>
                <CardDescription>
                  Generate API keys to authenticate your integration requests
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Label (e.g. Zapier Integration)"
                    value={newKeyLabel}
                    onChange={(e) => setNewKeyLabel(e.target.value)}
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                  <Button
                    onClick={createApiKey}
                    disabled={creatingKey || !newKeyLabel.trim()}
                    className="bg-yellow-500 hover:bg-yellow-600 text-black"
                  >
                    {creatingKey ? "Creating..." : "Generate Key"}
                  </Button>
                </div>

                <div className="space-y-3">
                  {apiKeys.map((key) => (
                    <div
                      key={key.id}
                      className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-700"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{key.label}</p>
                          <Badge
                            variant={key.status === "active" ? "default" : "secondary"}
                            className={
                              key.status === "active"
                                ? "bg-green-500/20 text-green-400 border-green-500/50"
                                : "bg-gray-500/20 text-gray-400 border-gray-500/50"
                            }
                          >
                            {key.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-400 mt-1">
                          Created {new Date(key.created_at).toLocaleDateString()}
                          {key.last_used_at && (
                            <> • Last used {new Date(key.last_used_at).toLocaleDateString()}</>
                          )}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(key.api_key)}
                          className="text-gray-400 hover:text-white"
                        >
                          {copiedKey === key.api_key ? (
                            <CheckCircle className="h-4 w-4" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => revokeKey(key.id)}
                          className="text-red-400 hover:text-red-300"
                          disabled={key.status === "revoked"}
                        >
                          Revoke
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Integrations Tab */}
          <TabsContent value="integrations" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              {integrations.map((integration) => (
                <Card
                  key={integration.id}
                  className="bg-gray-900/50 border-gray-800 hover:border-yellow-500/50 transition-colors"
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-xl">{integration.display_name}</CardTitle>
                        <CardDescription className="mt-1">
                          {integration.description}
                        </CardDescription>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          integration.connected
                            ? "bg-green-500/20 text-green-400 border-green-500/50"
                            : "bg-gray-500/20 text-gray-400 border-gray-500/50"
                        }
                      >
                        {integration.connected ? "Connected" : "Available"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Button
                      onClick={() => connectIntegration(integration.service_name)}
                      className="w-full bg-yellow-500 hover:bg-yellow-600 text-black"
                    >
                      {integration.connected ? "Manage" : "Connect"}
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Documentation Tab */}
          <TabsContent value="docs" className="space-y-6">
            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-yellow-500" />
                  <CardTitle>API Documentation</CardTitle>
                </div>
                <CardDescription>
                  Learn how to integrate with AUREV HQ ecosystem
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2">Getting Started</h3>
                    <p className="text-gray-400 text-sm">
                      All API requests require authentication using a partner API key. Include it in the
                      header:
                    </p>
                    <pre className="bg-gray-800 rounded-lg p-4 mt-2 text-sm overflow-x-auto">
                      {`Authorization: Bearer YOUR_PARTNER_API_KEY
X-Partner-API-Key: YOUR_PARTNER_API_KEY`}
                    </pre>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Partner API Gateway</h3>
                    <p className="text-gray-400 text-sm mb-2">
                      Use the unified partner API gateway for all integration requests:
                    </p>
                    <pre className="bg-gray-800 rounded-lg p-4 text-sm overflow-x-auto">
                      {`GET  /api/hq/integrations/{service}      # Get integration status
GET  /api/hq/integrations/{service}?action=auth  # Get OAuth URL
POST /api/hq/integrations/{service}              # Trigger action`}
                    </pre>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Webhook Setup</h3>
                    <p className="text-gray-400 text-sm mb-2">
                      Configure webhooks to receive real-time events:
                    </p>
                    <pre className="bg-gray-800 rounded-lg p-4 text-sm overflow-x-auto">
                      {`POST https://hq.aurevhq.com/webhook/{service}
X-Webhook-Signature: {signature}`}
                    </pre>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

