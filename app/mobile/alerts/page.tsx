"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CloudRain, Zap, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabaseBrowser";

/**
 * Feature A — Storm Alerts Screen
 * Shows storm alerts and allows one-tap campaign launch
 */
type StormAlert = {
  id: string;
  storm_type: string;
  location: string;
  severity: string;
  created_at: string;
  metadata?: any;
};

export default function MobileAlertsPage() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<StormAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState<string | null>(null);

  useEffect(() => {
    loadAlerts();
  }, []);

  async function loadAlerts() {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

      // Get workspace
      const { data: workspace } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", session.user.id)
        .limit(1)
        .single();

      if (!workspace) return;

      // Load recent storm alerts
      const { data: weatherEvents, error } = await supabase
        .from("weather_events")
        .select("*")
        .eq("workspace_id", workspace.workspace_id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) {
        console.error("Error loading alerts:", error);
        return;
      }

      // Transform to alerts format
      const stormAlerts = (weatherEvents || []).map((event: any) => ({
        id: event.id,
        storm_type: event.storm_type || "storm",
        location: event.zip || "Unknown location",
        severity: event.severity || "medium",
        created_at: event.created_at,
        metadata: event.metadata || {},
      }));

      setAlerts(stormAlerts);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  }

  async function launchStormCampaign(alertId: string) {
    setLaunching(alertId);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: workspace } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", session.user.id)
        .limit(1)
        .single();

      if (!workspace) return;

      // Launch storm outreach campaign
      const res = await fetch("/api/mobile/campaigns/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: "storm_outreach",
          workspace_id: workspace.workspace_id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to launch campaign");
        return;
      }

      alert("Storm campaign launched! Homeowners in affected areas will be contacted.");
      router.push("/mobile/dashboard");
    } catch (error) {
      console.error("Error launching campaign:", error);
      alert("Failed to launch campaign");
    } finally {
      setLaunching(null);
    }
  }

  function getStormEmoji(type: string) {
    switch (type) {
      case "hail":
        return "🌨️";
      case "wind":
        return "💨";
      case "leak":
        return "💧";
      default:
        return "🌪️";
    }
  }

  function getSeverityColor(severity: string) {
    switch (severity) {
      case "high":
        return "bg-red-500";
      case "medium":
        return "bg-orange-500";
      default:
        return "bg-yellow-500";
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/mobile")}
            className="p-2 -ml-2"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold">Storm Alerts</h1>
            <p className="text-xs text-gray-600">Weather notifications</p>
          </div>
        </div>
      </div>

      {/* Alerts List */}
      <div className="p-4 space-y-3">
        {loading && (
          <div className="text-center text-gray-500 py-8">Loading alerts...</div>
        )}
        {!loading && alerts.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            No storm alerts right now. Check back later!
          </div>
        )}
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-orange-500"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{getStormEmoji(alert.storm_type)}</span>
                <div>
                  <div className="font-semibold text-gray-900 capitalize">
                    {alert.storm_type} Alert
                  </div>
                  <div className="text-sm text-gray-600">{alert.location}</div>
                </div>
              </div>
              <span
                className={`${getSeverityColor(alert.severity)} text-white text-xs px-2 py-1 rounded-full capitalize`}
              >
                {alert.severity}
              </span>
            </div>
            <div className="text-xs text-gray-500 mb-3">
              {new Date(alert.created_at).toLocaleString()}
            </div>
            <button
              onClick={() => launchStormCampaign(alert.id)}
              disabled={launching === alert.id}
              className="w-full bg-orange-500 text-white py-2 rounded-lg font-semibold flex items-center justify-center gap-2 disabled:bg-gray-300"
            >
              {launching === alert.id ? (
                "Launching..."
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  Launch Storm Campaign
                </>
              )}
            </button>
          </div>
        ))}
      </div>

      {/* Info Footer */}
      <div className="px-4 pb-4">
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-xs text-orange-800">
          ⚡ Storm outreach = biggest revenue generator. Launch campaigns when storms hit to turn weather into instant money.
        </div>
      </div>
    </div>
  );
}






































