"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

interface GeneralSettingsProps {
  canEdit: boolean;
}

export default function GeneralSettings({ canEdit }: GeneralSettingsProps) {
  const [workspaceName, setWorkspaceName] = useState("");
  const [defaultTimezone, setDefaultTimezone] = useState("America/Los_Angeles");
  const [weekStart, setWeekStart] = useState("monday");
  const [domainHint, setDomainHint] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      
      if (data.settings?.workspace) {
        setWorkspaceName(data.settings.workspace.name || "");
        setDefaultTimezone(data.settings.workspace.default_timezone || "America/Los_Angeles");
        setWeekStart(data.settings.workspace.week_start || "monday");
        setDomainHint(data.settings.workspace.domain_hint || "");
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!canEdit) return;

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/settings/general", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace: {
            name: workspaceName,
            default_timezone: defaultTimezone,
            week_start: weekStart,
            domain_hint: domainHint || undefined,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Save failed");
      }

      setMessage("Settings saved!");
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
        <h1 className="text-2xl font-semibold mb-2">General Settings</h1>
        <p className="text-muted-foreground mb-6">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">General Settings</h1>
        <p className="text-sm text-gray-600">
          Configure workspace name, timezone, and basic preferences
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Workspace Name
          </label>
          <Input
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            placeholder="My Workspace"
            disabled={!canEdit}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Default Timezone
          </label>
          <Input
            value={defaultTimezone}
            onChange={(e) => setDefaultTimezone(e.target.value)}
            placeholder="America/Los_Angeles"
            disabled={!canEdit}
          />
          <p className="mt-1 text-xs text-gray-500">
            IANA timezone identifier (e.g., America/New_York, Europe/London)
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Week Start
          </label>
          <select
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
            disabled={!canEdit}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          >
            <option value="monday">Monday</option>
            <option value="sunday">Sunday</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Domain for Enrichment Hint (Optional)
          </label>
          <Input
            value={domainHint}
            onChange={(e) => setDomainHint(e.target.value)}
            placeholder="example.com"
            disabled={!canEdit}
          />
          <p className="mt-1 text-xs text-gray-500">
            Helps with company enrichment accuracy
          </p>
        </div>

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








