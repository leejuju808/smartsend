"use client";

import { useState, useEffect } from "react";
import { Code, Key, Webhook, BookOpen, Play, Copy, Trash2, Plus } from "lucide-react";
import { createClientComponentClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { isSalesModeEnabled } from "@/lib/feature-flags";

interface ApiKey {
  id: string;
  name: string;
  key: string;
  created_at: string;
  last_used: string | null;
}

interface Webhook {
  id: string;
  url: string;
  event: string;
  active: boolean;
  created_at: string;
}

export default function DeveloperPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"keys" | "docs" | "webhooks" | "playground">("keys");
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewKey, setShowNewKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [showNewWebhook, setShowNewWebhook] = useState(false);
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [newWebhookEvent, setNewWebhookEvent] = useState("lead.created");

  useEffect(() => {
    // BLOCK 281000 — Sales Mode: hide developer portal (demo/dev-only).
    if (isSalesModeEnabled()) {
      router.replace("/dashboard");
      return;
    }
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [keysRes, webhooksRes] = await Promise.all([
        fetch("/api/settings/api-keys"),
        fetch("/api/settings/webhooks"),
      ]);

      if (keysRes.ok) {
        const keysData = await keysRes.json();
        setApiKeys(keysData.data || []);
      }

      if (webhooksRes.ok) {
        const webhooksData = await webhooksRes.json();
        setWebhooks(webhooksData.data || []);
      }
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function createApiKey() {
    if (!newKeyName.trim()) return;

    try {
      const res = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName }),
      });

      if (res.ok) {
        const data = await res.json();
        setNewKey(data.data.key);
        setNewKeyName("");
        setShowNewKey(false);
        loadData();
      }
    } catch (error) {
      console.error("Error creating API key:", error);
    }
  }

  async function revokeApiKey(keyId: string) {
    if (!confirm("Are you sure you want to revoke this API key?")) return;

    try {
      const res = await fetch(`/api/settings/api-keys/${keyId}/revoke`, {
        method: "POST",
      });

      if (res.ok) {
        loadData();
      }
    } catch (error) {
      console.error("Error revoking API key:", error);
    }
  }

  async function createWebhook() {
    if (!newWebhookUrl.trim()) return;

    try {
      const res = await fetch("/api/settings/webhooks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: newWebhookUrl,
          event: newWebhookEvent,
        }),
      });

      if (res.ok) {
        setNewWebhookUrl("");
        setShowNewWebhook(false);
        loadData();
      } else {
        const error = await res.json();
        alert(`Error: ${error.error?.message || "Failed to create webhook"}`);
      }
    } catch (error) {
      console.error("Error creating webhook:", error);
      alert("Failed to create webhook");
    }
  }

  async function deleteWebhook(webhookId: string) {
    if (!confirm("Are you sure you want to delete this webhook?")) return;

    try {
      const res = await fetch(`/api/settings/webhooks/${webhookId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        loadData();
      }
    } catch (error) {
      console.error("Error deleting webhook:", error);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  const tabs = [
    { id: "keys", label: "API Keys", icon: Key },
    { id: "docs", label: "Documentation", icon: BookOpen },
    { id: "webhooks", label: "Webhooks", icon: Webhook },
    { id: "playground", label: "Playground", icon: Play },
  ];

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Developer Portal</h1>
        <p className="text-gray-600 mt-2">
          Manage API keys, webhooks, and explore the SmartSend API
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                <Icon className="h-5 w-5" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* New Key Modal */}
      {newKey && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">API Key Created</h2>
            <p className="text-sm text-gray-600 mb-4">
              Copy this key now. You won't be able to see it again.
            </p>
            <div className="bg-gray-100 p-3 rounded flex items-center justify-between mb-4">
              <code className="text-sm font-mono">{newKey}</code>
              <button
                onClick={() => copyToClipboard(newKey)}
                className="ml-2 p-1 hover:bg-gray-200 rounded"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={() => setNewKey(null)}
              className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {activeTab === "keys" && (
        <div>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold">API Keys</h2>
            <button
              onClick={() => setShowNewKey(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Generate Key
            </button>
          </div>

          {showNewKey && (
            <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
              <input
                type="text"
                placeholder="Key name (e.g., Production API)"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-3"
              />
              <div className="flex gap-2">
                <button
                  onClick={createApiKey}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setShowNewKey(false);
                    setNewKeyName("");
                  }}
                  className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center py-8">Loading...</div>
          ) : apiKeys.length === 0 ? (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
              <Key className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No API keys yet. Create one to get started.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {apiKeys.map((key) => (
                <div
                  key={key.id}
                  className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between"
                >
                  <div>
                    <h3 className="font-semibold">{key.name}</h3>
                    <code className="text-sm text-gray-600">{key.key}</code>
                    <p className="text-xs text-gray-500 mt-1">
                      Created {new Date(key.created_at).toLocaleDateString()}
                      {key.last_used && ` • Last used ${new Date(key.last_used).toLocaleDateString()}`}
                    </p>
                  </div>
                  <button
                    onClick={() => revokeApiKey(key.id)}
                    className="text-red-600 hover:text-red-700 p-2"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "docs" && (
        <div className="prose max-w-none">
          <h2>API Documentation</h2>
          <p>Full API documentation is available at:</p>
          <code className="block bg-gray-100 p-3 rounded">
            {typeof window !== "undefined" && window.location.origin}/api/docs
          </code>
          <h3>Base URL</h3>
          <code className="block bg-gray-100 p-3 rounded">
            {typeof window !== "undefined" && window.location.origin}/api/v1
          </code>
          <h3>Authentication</h3>
          <p>Include your API key in the Authorization header:</p>
          <code className="block bg-gray-100 p-3 rounded">
            Authorization: Bearer ss_live_xxxxxxxxx
          </code>
        </div>
      )}

      {activeTab === "webhooks" && (
        <div>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold">Webhooks</h2>
            <button
              onClick={() => setShowNewWebhook(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Add Webhook
            </button>
          </div>

          {showNewWebhook && (
            <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
              <input
                type="url"
                placeholder="Webhook URL"
                value={newWebhookUrl}
                onChange={(e) => setNewWebhookUrl(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-3"
              />
              <select
                value={newWebhookEvent}
                onChange={(e) => setNewWebhookEvent(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-3"
              >
                <option value="lead.created">Lead Created</option>
                <option value="lead.updated">Lead Updated</option>
                <option value="lead.replied">Lead Replied</option>
                <option value="email.sent">Email Sent</option>
                <option value="email.open">Email Opened</option>
                <option value="email.click">Email Clicked</option>
              </select>
              <div className="flex gap-2">
                <button
                  onClick={createWebhook}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setShowNewWebhook(false);
                    setNewWebhookUrl("");
                  }}
                  className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {webhooks.length === 0 ? (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
              <Webhook className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No webhooks configured.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {webhooks.map((webhook) => (
                <div
                  key={webhook.id}
                  className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between"
                >
                  <div>
                    <h3 className="font-semibold">{webhook.event}</h3>
                    <code className="text-sm text-gray-600">{webhook.url}</code>
                    <p className="text-xs text-gray-500 mt-1">
                      {webhook.active ? "Active" : "Inactive"}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteWebhook(webhook.id)}
                    className="text-red-600 hover:text-red-700 p-2"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "playground" && (
        <div>
          <h2 className="text-xl font-semibold mb-4">API Playground</h2>
          <p className="text-gray-600 mb-4">
            Test API requests directly from your browser.
          </p>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
            <p className="text-sm text-gray-600">
              Playground coming soon. Use tools like Postman or curl to test the API.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

