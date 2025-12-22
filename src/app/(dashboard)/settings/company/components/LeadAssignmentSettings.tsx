"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";

interface LeadAssignmentSettingsProps {
  canEdit: boolean;
}

export default function LeadAssignmentSettings({ canEdit }: LeadAssignmentSettingsProps) {
  const [assignmentLogic, setAssignmentLogic] = useState("manual");
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

      if (data.assignment) {
        setAssignmentLogic(data.assignment.assignment_logic || "manual");
      }
    } catch (error) {
      console.error("Failed to load assignment settings:", error);
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
          section: "assignment",
          data: {
            assignment_logic: assignmentLogic,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Save failed");
      }

      setMessage("Lead assignment rules saved!");
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
        <h1 className="text-2xl font-semibold mb-2">Lead Assignment Rules</h1>
        <p className="text-muted-foreground mb-6">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Lead Assignment Rules</h1>
        <p className="text-sm text-gray-600">
          Configure how leads are automatically assigned to staff members
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Assignment Logic
          </label>
          <div className="space-y-3">
            <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                name="assignment"
                value="manual"
                checked={assignmentLogic === "manual"}
                onChange={(e) => setAssignmentLogic(e.target.value)}
                disabled={!canEdit}
                className="mt-1"
              />
              <div>
                <div className="font-medium">Manual Assignment</div>
                <div className="text-sm text-gray-500">
                  Owner/Manager assigns leads individually
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                name="assignment"
                value="round_robin"
                checked={assignmentLogic === "round_robin"}
                onChange={(e) => setAssignmentLogic(e.target.value)}
                disabled={!canEdit}
                className="mt-1"
              />
              <div>
                <div className="font-medium">Round-Robin</div>
                <div className="text-sm text-gray-500">
                  Leads are evenly distributed between staff members
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                name="assignment"
                value="by_pipeline_stage"
                checked={assignmentLogic === "by_pipeline_stage"}
                onChange={(e) => setAssignmentLogic(e.target.value)}
                disabled={!canEdit}
                className="mt-1"
              />
              <div>
                <div className="font-medium">Based on Pipeline Stage</div>
                <div className="text-sm text-gray-500">
                  Warm → Staff A, Hot → Staff B, Insurance → Owner only
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                name="assignment"
                value="by_region"
                checked={assignmentLogic === "by_region"}
                onChange={(e) => setAssignmentLogic(e.target.value)}
                disabled={!canEdit}
                className="mt-1"
              />
              <div>
                <div className="font-medium">Based on Region/Zip</div>
                <div className="text-sm text-gray-500">
                  Assign leads based on zip code mapping (zip mapping stored manually)
                </div>
              </div>
            </label>
          </div>
        </div>

        {assignmentLogic !== "manual" && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> Advanced configuration for {assignmentLogic.replace("_", " ")} assignment will be available in a future update.
              Assigned staff will see the lead in their dashboard immediately.
            </p>
          </div>
        )}

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





















































