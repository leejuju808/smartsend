"use client";

import { useState, useEffect } from "react";
import { createClientComponentClient } from "@/lib/supabase";
import { Mail, CheckCircle2, XCircle, AlertCircle, Trash2 } from "lucide-react";
import { isSalesModeEnabled } from "@/lib/feature-flags";

interface EmailCredential {
  id: string;
  provider: string;
  email_address: string;
  display_name?: string;
  verified: boolean;
  daily_send_limit: number;
  created_at: string;
}

export default function EmailSettings({ canEdit }: { canEdit: boolean }) {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [credentials, setCredentials] = useState<EmailCredential[]>([]);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    loadCredentials();
    
    // Check for OAuth callback messages
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");
    
    if (connected) {
      setMessage({ type: "success", text: "Email connected successfully!" });
      loadCredentials();
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname);
    } else if (error) {
      setMessage({ type: "error", text: `Error: ${error}` });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const loadCredentials = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch("/api/settings/email/connect", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setCredentials(data.credentials || []);
      }
    } catch (error) {
      console.error("Error loading credentials:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectGmail = () => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const redirectUri = `${window.location.origin}/api/settings/email/oauth/gmail/callback`;
    const scope = "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email";
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`;
    window.location.href = authUrl;
  };

  const handleConnectOutlook = () => {
    // TODO: Implement Outlook OAuth
    alert("Outlook connection is not available in v1.");
  };

  const handleDisconnect = async (credentialId: string) => {
    if (!canEdit || !confirm("Are you sure you want to disconnect this email?")) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(`/api/settings/email/connect?id=${credentialId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        loadCredentials();
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error("Error disconnecting email:", error);
      alert("Failed to disconnect email");
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Sending Email Setup</h2>
        <p className="mt-1 text-sm text-gray-600">
          Connect your email account to send campaigns
        </p>
      </div>

      {/* Success/Error Messages */}
      {message && (
        <div
          className={`rounded-md p-4 ${
            message.type === "success"
              ? "bg-green-50 border border-green-200 text-green-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}
        >
          <div className="flex items-center justify-between">
            <span>{message.text}</span>
            <button
              onClick={() => setMessage(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Connection Options */}
      {credentials.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4">Connect Your Sending Email</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={handleConnectGmail}
              disabled={!canEdit}
              className="flex items-center justify-center px-6 py-4 border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Mail className="h-6 w-6 mr-3 text-gray-600" />
              <div className="text-left">
                <div className="font-medium text-gray-900">Connect Gmail</div>
                <div className="text-sm text-gray-500">OAuth connection</div>
              </div>
            </button>
            {!isSalesModeEnabled() && (
              <button
                onClick={handleConnectOutlook}
                disabled={!canEdit}
                className="flex items-center justify-center px-6 py-4 border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Mail className="h-6 w-6 mr-3 text-gray-600" />
                <div className="text-left">
                  <div className="font-medium text-gray-900">Connect Outlook</div>
                  <div className="text-sm text-gray-500">OAuth connection</div>
                </div>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Connected Emails */}
      {credentials.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4">
          <h3 className="text-lg font-semibold">Connected Email Accounts</h3>
          {credentials.map((cred) => (
            <div
              key={cred.id}
              className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
            >
              <div className="flex items-center gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{cred.email_address}</span>
                    {cred.verified ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    {cred.provider} • Daily limit: {cred.daily_send_limit} emails
                  </div>
                </div>
              </div>
              {canEdit && (
                <button
                  onClick={() => handleDisconnect(cred.id)}
                  className="text-red-600 hover:text-red-800"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Best Practices */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">Best Practices:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Send from a business email (recommended)</li>
              <li>Warm up your email before high-volume outreach</li>
              <li>Monitor your daily sending limits</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

