"use client";

import { useState, useEffect } from "react";
import { createClientComponentClient } from "@/lib/supabase";

interface HubspotStatus {
  connected: boolean;
  portalId?: number;
  lastSync?: string;
}

export default function HubspotCard() {
  const [status, setStatus] = useState<HubspotStatus>({ connected: false });
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const supabase = createClientComponentClient();

  useEffect(() => {
    checkHubspotStatus();
  }, []);

  async function checkHubspotStatus() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: prof } = await supabase
        .from("profiles")
        .select("team_id")
        .eq("id", user.id)
        .maybeSingle();

      if (prof?.team_id) {
        const { data: token } = await supabase
          .from("hubspot_tokens")
          .select("portal_id, updated_at")
          .eq("team_id", prof.team_id)
          .maybeSingle();

        if (token) {
          setStatus({
            connected: true,
            portalId: token.portal_id,
            lastSync: token.updated_at
          });
        }
      }
    } catch (error) {
      console.error("Error checking HubSpot status:", error);
    }
  }

  async function syncContacts() {
    if (!status.connected) return;
    
    setSyncing(true);
    try {
      const response = await fetch("/api/integrations/hubspot/sync-contacts", {
        method: "POST"
      });
      
      if (response.ok) {
        const result = await response.json();
        alert(`Contacts sync completed!\nSynced: ${result.count}\nTotal: ${result.total}\nErrors: ${result.errors}`);
        await checkHubspotStatus(); // Refresh status
      } else {
        const error = await response.json();
        alert(`Sync failed: ${error.error}`);
      }
    } catch (error) {
      console.error("Error syncing contacts:", error);
      alert("Sync failed. Please try again.");
    } finally {
      setSyncing(false);
    }
  }

  async function disconnectHubspot() {
    if (!confirm("This will disconnect your HubSpot integration. All synced data will remain in HubSpot, but new data won't be synced. Continue?")) {
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: prof } = await supabase
        .from("profiles")
        .select("team_id")
        .eq("id", user.id)
        .maybeSingle();

      if (prof?.team_id) {
        await supabase
          .from("hubspot_tokens")
          .delete()
          .eq("team_id", prof.team_id);
        
        setStatus({ connected: false });
        alert("HubSpot integration disconnected successfully.");
      }
    } catch (error) {
      console.error("Error disconnecting HubSpot:", error);
      alert("Failed to disconnect. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">HubSpot Integration</h3>
          {status.connected && (
            <p className="text-sm text-green-600">
              Connected {status.portalId && `(Portal: ${status.portalId})`}
            </p>
          )}
        </div>
        {!status.connected ? (
          <a 
            href="/api/integrations/hubspot/start" 
            className="px-3 py-2 rounded bg-black text-white text-sm hover:bg-gray-800 transition-colors"
          >
            Connect
          </a>
        ) : (
          <button
            onClick={disconnectHubspot}
            disabled={loading}
            className="px-3 py-2 rounded border border-gray-300 text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {loading ? "Disconnecting..." : "Disconnect"}
          </button>
        )}
      </div>
      
      <p className="text-sm text-gray-600">
        Sync contacts and log SmartSendAI replies as activities in HubSpot.
      </p>
      
      {status.connected && (
        <div className="space-y-2">
          {status.lastSync && (
            <p className="text-xs text-gray-500">
              Last sync: {new Date(status.lastSync).toLocaleDateString()}
            </p>
          )}
          
          <div className="flex gap-2">
            <button
              onClick={syncContacts}
              disabled={syncing}
              className="px-3 py-2 rounded border text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {syncing ? "Syncing..." : "Sync Contacts"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 