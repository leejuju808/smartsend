"use client";

import { useState, useEffect } from "react";
import { createClientComponentClient } from "@/lib/supabase";
import { Trash2, Plus, Zap, MessageSquare, Building2, CheckCircle, AlertCircle, Mail } from "lucide-react";
import IntegrationCard from "@/components/IntegrationCard";

interface Integration {
  id: string;
  type: string;
  config: any;
  created_at: string;
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [type, setType] = useState("zapier");
  const [accessToken, setAccessToken] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [user, setUser] = useState<any>(null);
  const [workspace, setWorkspace] = useState<any>(null);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [outlookConnected, setOutlookConnected] = useState(false);
  const [outlookEmail, setOutlookEmail] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);

  const supabase = createClientComponentClient();

  const loadIntegrations = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/integrations");
      if (response.ok) {
        const data = await response.json();
        setIntegrations(data);
      } else {
        console.error("Failed to load integrations");
      }
    } catch (error) {
      console.error("Error loading integrations:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserAndWorkspace = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUser(user);
        
        // Get user's workspace
        const { data: workspaceData } = await supabase
          .from("workspaces")
          .select("*")
          .eq("owner_id", user.id)
          .single();
        
        if (workspaceData) {
          setWorkspace(workspaceData);
        }

        // Get org_id for oauth_connections
        const roleRes = await fetch("/api/me/role");
        if (roleRes.ok) {
          const roleData = await roleRes.json();
          setOrgId(roleData.org_id);
          
          // Check Gmail connection using new API
          if (roleData.org_id) {
            const gmailRes = await fetch(`/api/integrations/google/status?org=${roleData.org_id}`);
            if (gmailRes.ok) {
              const gmailData = await gmailRes.json();
              setGmailConnected(gmailData.connected);
              setGmailEmail(gmailData.email || null);
            }
          }
        }

        // Check Outlook connection via org
        const { data: orgRow } = await supabase.rpc("get_primary_org_for_user");
        if (orgRow?.org_id) {
          const { data: outlookData } = await supabase
            .from("outlook_accounts")
            .select("email")
            .eq("org_id", orgRow.org_id)
            .maybeSingle();
          
          setOutlookConnected(!!outlookData);
          setOutlookEmail(outlookData?.email || null);
        }
      }
    } catch (error) {
      console.error("Error loading user and workspace:", error);
    }
  };

  const handleForceSync = async (provider: "gmail" | "outlook") => {
    setSyncing(provider);
    try {
      const endpoint = provider === "gmail" ? "/api/gmail/sync" : "/api/outlook/sync";
      const response = await fetch(endpoint, { method: "POST" });
      const data = await response.json();
      
      if (response.ok) {
        setMessage({ type: "success", text: `${provider === "gmail" ? "Gmail" : "Outlook"} sync triggered successfully!` });
      } else {
        setMessage({ type: "error", text: data.error || `Failed to sync ${provider}` });
      }
    } catch (error) {
      setMessage({ type: "error", text: `Failed to trigger ${provider} sync` });
    } finally {
      setSyncing(null);
    }
  };

  useEffect(() => {
    loadIntegrations();
    loadUserAndWorkspace();
    
    // Check for connection success messages
    const params = new URLSearchParams(window.location.search);
    if (params.get("outlook") === "connected") {
      setMessage({ type: "success", text: "Outlook connected successfully!" });
      loadUserAndWorkspace();
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (params.get("connected") === "gmail") {
      setMessage({ type: "success", text: "Gmail connected successfully!" });
      loadUserAndWorkspace();
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      let config = {};
      
      switch (type) {
        case "zapier":
          config = { url };
          break;
        case "slack":
          config = { webhook_url: webhookUrl };
          break;
        case "hubspot":
          config = { access_token: accessToken };
          break;
      }

      const response = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, config })
      });

      if (response.ok) {
        setMessage({ type: "success", text: `${type} integration added successfully!` });
        setUrl("");
        setWebhookUrl("");
        setAccessToken("");
        setType("zapier");
        setShowForm(false);
        await loadIntegrations();
      } else {
        const error = await response.json();
        setMessage({ type: "error", text: error.error || "Failed to add integration" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "An error occurred while adding the integration" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this integration?")) return;

    try {
      const response = await fetch(`/api/integrations?id=${id}`, {
        method: "DELETE"
      });

      if (response.ok) {
        setMessage({ type: "success", text: "Integration deleted successfully!" });
        await loadIntegrations();
      } else {
        setMessage({ type: "error", text: "Failed to delete integration" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "An error occurred while deleting the integration" });
    }
  };

  const getIntegrationIcon = (type: string) => {
    switch (type) {
      case "zapier": return <Zap className="h-5 w-5 text-orange-500" />;
      case "slack": return <MessageSquare className="h-5 w-5 text-blue-500" />;
      case "hubspot": return <Building2 className="h-5 w-5 text-orange-600" />;
      default: return <Zap className="h-5 w-5 text-gray-500" />;
    }
  };

  const getIntegrationName = (type: string) => {
    switch (type) {
      case "zapier": return "Zapier Webhook";
      case "slack": return "Slack Webhook";
      case "hubspot": return "HubSpot CRM";
      default: return type;
    }
  };

  const formatConfig = (config: any, type: string) => {
    switch (type) {
      case "zapier":
        return config.url ? `Webhook: ${config.url.substring(0, 50)}...` : "No URL configured";
      case "slack":
        return config.webhook_url ? `Channel: ${config.webhook_url.substring(0, 50)}...` : "No webhook configured";
      case "hubspot":
        return config.access_token ? "Access token configured" : "No token configured";
      default:
        return JSON.stringify(config);
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Integrations Hub</h1>
          <p className="text-gray-600 mt-1">
            Connect SmartSend with your favorite tools and get real-time notifications
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Integration
        </button>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg ${
          message.type === "success" ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
        }`}>
          <div className="flex items-center">
            {message.type === "success" ? (
              <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
            )}
            <span className={message.type === "success" ? "text-green-800" : "text-red-800"}>
              {message.text}
            </span>
          </div>
        </div>
      )}

      {/* Add Integration Form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
          <h3 className="text-lg font-medium text-gray-900">Add New Integration</h3>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Integration Type
              </label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="zapier">Zapier Webhook</option>
                <option value="slack">Slack Webhook</option>
                <option value="hubspot">HubSpot CRM</option>
              </select>
            </div>

            {type === "zapier" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Webhook URL
                </label>
                <input
                  type="url"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                  placeholder="https://hooks.zapier.com/hooks/catch/..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
                <p className="text-sm text-gray-500 mt-1">
                  Create a Zapier webhook and paste the URL here
                </p>
              </div>
            )}

            {type === "slack" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Slack Webhook URL
                </label>
                <input
                  type="url"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                  placeholder="https://hooks.slack.com/services/..."
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  required
                />
                <p className="text-sm text-gray-500 mt-1">
                  Create a Slack app webhook and paste the URL here
                </p>
              </div>
            )}

            {type === "hubspot" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Access Token
                </label>
                <input
                  type="password"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                  placeholder="Enter your HubSpot access token"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  required
                />
                <p className="text-sm text-gray-500 mt-1">
                  Get this from your HubSpot developer account
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Adding..." : "Add Integration"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Integrations List */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Your Integrations</h3>
        </div>
        
        {loading ? (
          <div className="p-6 text-center text-gray-500">Loading integrations...</div>
        ) : integrations.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            <Zap className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-900 mb-2">No integrations yet</p>
            <p className="text-gray-600">Add your first integration to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {integrations.map((integration) => (
              <div key={integration.id} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {getIntegrationIcon(integration.type)}
                  <div>
                    <h4 className="font-medium text-gray-900">
                      {getIntegrationName(integration.type)}
                    </h4>
                    <p className="text-sm text-gray-500">
                      {formatConfig(integration.config, integration.type)}
                    </p>
                    <p className="text-xs text-gray-400">
                      Added {new Date(integration.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                
                <button
                  onClick={() => handleDelete(integration.id)}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete integration"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Email Provider Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Gmail Status */}
        {orgId && <IntegrationCard provider="google" orgId={orgId} />}

        {/* Outlook Status */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <Mail className="h-6 w-6 text-blue-500" />
              <div>
                <h3 className="text-lg font-medium text-gray-900">Outlook</h3>
                {outlookConnected && outlookEmail ? (
                  <div className="flex items-center space-x-2 mt-1">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-gray-600">{outlookEmail}</span>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 mt-1">Not connected</p>
                )}
              </div>
            </div>
          </div>
          {outlookConnected ? (
            <button
              onClick={() => handleForceSync("outlook")}
              disabled={syncing === "outlook"}
              className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
            >
              {syncing === "outlook" ? "Syncing..." : "Force Sync Now"}
            </button>
          ) : (
            <a
              href="/api/outlook/connect"
              className="block w-full text-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Connect Outlook
            </a>
          )}
        </div>
      </div>

      {/* Integration Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-medium text-blue-900 mb-3">How Integrations Work</h3>
        <div className="space-y-3 text-sm text-blue-800">
          <p>
            <strong>Gmail:</strong> Send emails directly through your Gmail account for better deliverability and sender reputation.
          </p>
          <p>
            <strong>Zapier:</strong> Automatically trigger actions in 5000+ apps when emails are opened, clicked, or replied to.
          </p>
          <p>
            <strong>Slack:</strong> Get real-time notifications in your Slack channels for important email events.
          </p>
          <p>
            <strong>HubSpot:</strong> Sync contact data and create deals automatically when leads engage with your emails.
          </p>
        </div>
      </div>
    </div>
  );
} 