"use client";
import { useEffect, useState } from "react";
import TestSendModal from "./TestSendModal";

interface IntegrationStatus {
  connected: boolean;
  email?: string;
  expires_at?: string;
}

interface IntegrationCardProps {
  provider: "google";
  orgId: string;
}

export default function IntegrationCard({ provider, orgId }: IntegrationCardProps) {
  const [status, setStatus] = useState<IntegrationStatus>({ connected: false });
  const [loading, setLoading] = useState(true);
  const [showTestModal, setShowTestModal] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    loadStatus();
  }, [orgId, provider]);

  async function loadStatus() {
    setLoading(true);
    try {
      const res = await fetch(`/api/integrations/${provider}/status?org=${orgId}`);
      const data = await res.json();
      setStatus(data);
    } catch (error) {
      console.error("Error loading status:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect() {
    window.location.href = `/api/oauth/${provider}/start?org=${orgId}`;
  }

  async function handleDisconnect() {
    if (!confirm("Are you sure you want to disconnect this integration?")) return;
    
    setDisconnecting(true);
    try {
      const res = await fetch(`/api/integrations/${provider}/disconnect?org=${orgId}`, {
        method: "POST",
      });
      if (res.ok) {
        await loadStatus();
      } else {
        alert("Failed to disconnect");
      }
    } catch (error) {
      console.error("Error disconnecting:", error);
      alert("Error disconnecting");
    } finally {
      setDisconnecting(false);
    }
  }

  const providerNames: Record<string, string> = {
    google: "Gmail",
  };

  const providerIcons: Record<string, string> = {
    google: "📧",
  };

  return (
    <>
      <div className="border rounded-lg p-6 bg-white shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="text-4xl">{providerIcons[provider]}</div>
            <div>
              <h3 className="text-lg font-semibold">{providerNames[provider]}</h3>
              <p className="text-sm text-gray-600 mt-1">
                Send emails using your {providerNames[provider]} account
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
            Loading status...
          </div>
        ) : status.connected ? (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center gap-2">
                <span className="text-green-600 text-sm">● Connected</span>
                <span className="text-sm text-gray-700">{status.email}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowTestModal(true)}
                className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50 hover:bg-gray-800"
              >
                Send test
              </button>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                {disconnecting ? "Disconnecting..." : "Disconnect"}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <button
              onClick={handleConnect}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-800 transition-colors"
            >
              Connect {providerNames[provider]}
            </button>
          </div>
        )}
      </div>

      {showTestModal && (
        <TestSendModal
          provider={provider}
          orgId={orgId}
          onClose={() => setShowTestModal(false)}
          onSend={() => {
            setShowTestModal(false);
            loadStatus();
          }}
        />
      )}
    </>
  );
}

