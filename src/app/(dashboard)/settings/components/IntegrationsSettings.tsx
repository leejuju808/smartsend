"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Calendar, Mail, Webhook, Zap, CheckCircle, XCircle } from "lucide-react";

interface IntegrationsSettingsProps {
  canEdit: boolean;
}

export default function IntegrationsSettings({ canEdit }: IntegrationsSettingsProps) {
  const [googleCalendar, setGoogleCalendar] = useState(false);
  const [gmail, setGmail] = useState(false);
  const [outlook, setOutlook] = useState(false);
  const [webhooks, setWebhooks] = useState(false);
  const [zapier, setZapier] = useState(false);
  const [jobnimbus, setJobnimbus] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch("/api/settings/integrations");
      const data = await res.json();
      
      if (data.settings?.integrations) {
        const integrations = data.settings.integrations;
        setGoogleCalendar(integrations.google_calendar_enabled || false);
        setGmail(integrations.gmail_enabled || false);
        setOutlook(integrations.outlook_enabled || false);
        setWebhooks(integrations.webhooks_enabled || false);
        setZapier(integrations.zapier_enabled || false);
        setJobnimbus(integrations.jobnimbus_export_enabled || false);
      }
    } catch (error) {
      console.error("Failed to load integrations:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!canEdit) return;

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/settings/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integrations: {
            google_calendar_enabled: googleCalendar,
            gmail_enabled: gmail,
            outlook_enabled: outlook,
            webhooks_enabled: webhooks,
            zapier_enabled: zapier,
            jobnimbus_export_enabled: jobnimbus,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Save failed");
      }

      setMessage("Integrations updated!");
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-semibold mb-2">Integrations</h1>
        <p className="text-muted-foreground mb-6">Loading...</p>
      </div>
    );
  }

  const integrations = [
    { key: "googleCalendar", label: "Google Calendar", icon: Calendar, enabled: googleCalendar, setter: setGoogleCalendar },
    { key: "gmail", label: "Gmail", icon: Mail, enabled: gmail, setter: setGmail },
    { key: "outlook", label: "Outlook", icon: Mail, enabled: outlook, setter: setOutlook },
    { key: "webhooks", label: "Webhooks", icon: Webhook, enabled: webhooks, setter: setWebhooks },
    { key: "zapier", label: "Zapier", icon: Zap, enabled: zapier, setter: setZapier },
    { key: "jobnimbus", label: "JobNimbus Export", icon: Zap, enabled: jobnimbus, setter: setJobnimbus },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Integrations</h1>
        <p className="text-sm text-gray-600">
          Available integrations: Google Calendar, Gmail/Outlook, Webhooks, Zapier, JobNimbus
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        {integrations.map((integration) => {
          const Icon = integration.icon;
          return (
            <div
              key={integration.key}
              className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">{integration.label}</span>
              </div>
              <div className="flex items-center gap-2">
                {integration.enabled ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-gray-400" />
                )}
                {canEdit && (
                  <input
                    type="checkbox"
                    checked={integration.enabled}
                    onChange={(e) => integration.setter(e.target.checked)}
                    className="rounded"
                  />
                )}
              </div>
            </div>
          );
        })}

        {canEdit && (
          <div className="flex justify-end pt-4 border-t">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        )}

        {message && (
          <div
            className={`p-3 rounded-lg ${
              message.startsWith("Error")
                ? "bg-red-50 text-red-700"
                : "bg-green-50 text-green-700"
            }`}
          >
            {message}
          </div>
        )}
      </div>
    </div>
  );
}





















































