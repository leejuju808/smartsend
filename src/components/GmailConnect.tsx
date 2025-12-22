"use client";
import { useState, useEffect } from "react";
import { createClientComponentClient } from "@/lib/supabase";
import { Mail, CheckCircle, AlertCircle, ExternalLink } from "lucide-react";

interface GmailProvider {
  id: string;
  email: string;
  created_at: string;
}

interface GmailConnectProps {
  userId: string;
  workspaceId: string;
}

export default function GmailConnect({ userId, workspaceId }: GmailConnectProps) {
  const [providers, setProviders] = useState<GmailProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const supabase = createClientComponentClient();

  const loadProviders = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("user_email_providers")
        .select("id, email, created_at")
        .eq("user_id", userId)
        .eq("workspace_id", workspaceId)
        .eq("provider", "gmail");

      if (error) throw error;
      setProviders(data || []);
    } catch (error) {
      console.error("Error loading Gmail providers:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProviders();
  }, [userId, workspaceId]);

  const handleConnect = async () => {
    setConnecting(true);
    setMessage(null);

    try {
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;
      const redirectUri = process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI!;
      const scope = [
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/userinfo.email",
      ].join(" ");
      const state = encodeURIComponent(JSON.stringify({ user_id: userId, workspace_id: workspaceId }));

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
        clientId
      )}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(
        scope
      )}&access_type=offline&prompt=consent&state=${state}`;

      // Redirect to Google OAuth
      window.location.href = authUrl;
    } catch (error) {
      setMessage({ type: "error", text: "Failed to initiate Gmail connection" });
      setConnecting(false);
    }
  };

  const handleDisconnect = async (providerId: string) => {
    if (!confirm("Are you sure you want to disconnect this Gmail account?")) return;

    try {
      const { error } = await supabase
        .from("user_email_providers")
        .delete()
        .eq("id", providerId);

      if (error) throw error;

      setMessage({ type: "success", text: "Gmail account disconnected successfully!" });
      await loadProviders();
    } catch (error) {
      setMessage({ type: "error", text: "Failed to disconnect Gmail account" });
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Mail className="h-6 w-6 text-red-500" />
          <div>
            <h3 className="text-lg font-medium text-gray-900">Gmail Integration</h3>
            <p className="text-sm text-gray-600">
              Connect your Gmail account to send emails directly through Gmail's API
            </p>
          </div>
        </div>
        
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="inline-flex items-center px-4 py-2 rounded bg-red-500 text-white font-semibold hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {connecting ? "Connecting..." : "Connect Gmail"}
          <ExternalLink className="h-4 w-4 ml-2" />
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

      {/* Connected Accounts */}
      {loading ? (
        <div className="text-center text-gray-500 py-4">Loading Gmail accounts...</div>
      ) : providers.length === 0 ? (
        <div className="text-center text-gray-500 py-4">
          <Mail className="h-12 w-12 text-gray-300 mx-auto mb-2" />
          <p>No Gmail accounts connected yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          <h4 className="font-medium text-gray-900">Connected Gmail Accounts</h4>
          {providers.map((provider) => (
            <div key={provider.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <Mail className="h-5 w-5 text-red-500" />
                <div>
                  <p className="font-medium text-gray-900">{provider.email}</p>
                  <p className="text-sm text-gray-500">
                    Connected {new Date(provider.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleDisconnect(provider.id)}
                className="px-3 py-1 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
              >
                Disconnect
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">How Gmail Integration Works</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Send emails directly through your Gmail account</li>
          <li>• Maintains your sender reputation and deliverability</li>
          <li>• No need for separate SMTP configuration</li>
          <li>• Secure OAuth2 authentication with Google</li>
        </ul>
      </div>
    </div>
  );
}