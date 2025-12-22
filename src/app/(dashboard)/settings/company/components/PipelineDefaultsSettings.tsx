"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

interface PipelineDefaultsSettingsProps {
  canEdit: boolean;
}

export default function PipelineDefaultsSettings({ canEdit }: PipelineDefaultsSettingsProps) {
  const [defaultNewLeadStatus, setDefaultNewLeadStatus] = useState("cold");
  const [allowStaffToMoveLeads, setAllowStaffToMoveLeads] = useState(true);
  const [autoFollowupPauseOnReply, setAutoFollowupPauseOnReply] = useState(true);
  const [notInterestedTimeoutDays, setNotInterestedTimeoutDays] = useState(90);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch("/api/company/settings");
      const data = await res.json();

      if (data.pipeline) {
        setDefaultNewLeadStatus(data.pipeline.default_new_lead_status || "cold");
        setAllowStaffToMoveLeads(data.pipeline.allow_staff_to_move_leads ?? true);
        setAutoFollowupPauseOnReply(data.pipeline.auto_followup_pause_on_reply ?? true);
        setNotInterestedTimeoutDays(data.pipeline.not_interested_timeout_days || 90);
      }
    } catch (error) {
      console.error("Failed to load pipeline settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!canEdit) return;

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/company/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: "pipeline",
          data: {
            default_new_lead_status: defaultNewLeadStatus,
            allow_staff_to_move_leads: allowStaffToMoveLeads,
            auto_followup_pause_on_reply: autoFollowupPauseOnReply,
            not_interested_timeout_days: notInterestedTimeoutDays,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Save failed");
      }

      setMessage("Pipeline defaults saved!");
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
        <h1 className="text-2xl font-semibold mb-2">Pipeline Defaults</h1>
        <p className="text-muted-foreground mb-6">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Pipeline Defaults</h1>
        <p className="text-sm text-gray-600">
          Control pipeline behavior defaults, auto-status rules, and lead scoring mapping
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Default New Lead Status
          </label>
          <select
            value={defaultNewLeadStatus}
            onChange={(e) => setDefaultNewLeadStatus(e.target.value)}
            disabled={!canEdit}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
          >
            <option value="cold">Cold</option>
            <option value="warm">Warm</option>
            <option value="hot">Hot</option>
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Default status for newly imported leads
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-gray-700">Allow Staff to Move Leads</label>
            <p className="text-xs text-gray-500 mt-1">
              Let staff members change lead statuses in the pipeline
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={allowStaffToMoveLeads}
              onChange={(e) => setAllowStaffToMoveLeads(e.target.checked)}
              disabled={!canEdit}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-gray-700">Auto-Follow-Up Pause on Reply</label>
            <p className="text-xs text-gray-500 mt-1">
              Automatically pause follow-up sequences when a lead replies
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={autoFollowupPauseOnReply}
              onChange={(e) => setAutoFollowupPauseOnReply(e.target.checked)}
              disabled={!canEdit}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Not Interested Timeout (days)
          </label>
          <Input
            type="number"
            value={notInterestedTimeoutDays}
            onChange={(e) => setNotInterestedTimeoutDays(parseInt(e.target.value) || 0)}
            disabled={!canEdit}
            className="w-full"
            min="1"
            max="365"
          />
          <p className="mt-1 text-xs text-gray-500">
            How long before a "Not Interested" lead can be re-contacted
          </p>
        </div>

        <div className="border-t pt-6">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Auto-Status Rules</h3>
          <p className="text-sm text-gray-600 mb-4">
            Configure automatic status changes based on import rules and task completion. (Advanced configuration not in v1)
          </p>
          <div className="bg-gray-50 p-4 rounded-md">
            <p className="text-xs text-gray-500">
              Auto-status rules on import and task completion are fixed in v1.
            </p>
          </div>
        </div>

        <div className="border-t pt-6">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Lead Score → Pipeline Mapping</h3>
          <p className="text-sm text-gray-600 mb-4">
            Automatically assign lead status based on lead score. (Advanced configuration not in v1)
          </p>
          <div className="bg-gray-50 p-4 rounded-md">
            <p className="text-xs text-gray-500">
              Default mapping: 0-30 = Cold, 31-60 = Warm, 61-100 = Hot
            </p>
          </div>
        </div>

        {message && (
          <div
            className={`p-3 rounded-md ${
              message.startsWith("Error")
                ? "bg-red-50 text-red-800"
                : "bg-green-50 text-green-800"
            }`}
          >
            {message}
          </div>
        )}

        {canEdit && (
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}





















































