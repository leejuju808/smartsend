"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface PlaybooksSettingsProps {
  canEdit: boolean;
}

export default function PlaybooksSettings({ canEdit }: PlaybooksSettingsProps) {
  const [enabledPlaybooks, setEnabledPlaybooks] = useState<string[]>([]);
  const [defaultRecommended, setDefaultRecommended] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Example playbooks - in real app, fetch from API
  const availablePlaybooks = [
    { id: "saas_founder_meetings", name: "SaaS Founder Meetings" },
    { id: "reactivation_90_days", name: "Reactivation – 90 Days" },
    { id: "expansion_warm_prospects", name: "Expansion – Warm Prospects" },
  ];

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      
      if (data.settings?.playbooks) {
        setEnabledPlaybooks(data.settings.playbooks.enabled_playbooks || []);
        setDefaultRecommended(data.settings.playbooks.default_recommended || "");
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const togglePlaybook = (playbookId: string) => {
    if (!canEdit) return;
    
    setEnabledPlaybooks((prev) =>
      prev.includes(playbookId)
        ? prev.filter((id) => id !== playbookId)
        : [...prev, playbookId]
    );
  };

  const handleSave = async () => {
    if (!canEdit) return;

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/settings/playbooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playbooks: {
            enabled_playbooks: enabledPlaybooks,
            default_recommended: defaultRecommended || null,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Save failed");
      }

      setMessage("Playbooks settings updated!");
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
        <h1 className="text-2xl font-semibold mb-2">Playbooks Settings</h1>
        <p className="text-muted-foreground mb-6">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Playbooks Settings</h1>
        <p className="text-sm text-gray-600">
          Configure which playbooks are available and set defaults
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-4">Playbooks Enabled</h3>
          <div className="space-y-3">
            {availablePlaybooks.map((playbook) => (
              <label key={playbook.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={enabledPlaybooks.includes(playbook.id)}
                  onChange={() => togglePlaybook(playbook.id)}
                  disabled={!canEdit}
                  className="rounded"
                />
                <span className="text-sm">{playbook.name}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Default Recommended Playbook
          </label>
          <select
            value={defaultRecommended}
            onChange={(e) => setDefaultRecommended(e.target.value)}
            disabled={!canEdit}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          >
            <option value="">None</option>
            {availablePlaybooks
              .filter((p) => enabledPlaybooks.includes(p.id))
              .map((playbook) => (
                <option key={playbook.id} value={playbook.id}>
                  {playbook.name}
                </option>
              ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            This playbook will be recommended when creating new campaigns
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








