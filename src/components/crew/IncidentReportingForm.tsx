// Block 226000 — SmartSend Roofing Safety Compliance System
// Incident Reporting Component for Crew App

"use client";

import { useState } from "react";

interface IncidentReportingFormProps {
  jobId: string;
  crewId?: string;
  dailyLogId?: string;
  onSubmit: (incident: any) => void;
  onCancel?: () => void;
}

export function IncidentReportingForm({
  jobId,
  crewId,
  dailyLogId,
  onSubmit,
  onCancel,
}: IncidentReportingFormProps) {
  const [incidentType, setIncidentType] = useState<string>("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<string>("low");
  const [photoUrl, setPhotoUrl] = useState<string>("");
  const [requiresShutdown, setRequiresShutdown] = useState(false);
  const [loading, setLoading] = useState(false);

  const incidentTypes = [
    { value: "fall", label: "Fall" },
    { value: "cut", label: "Cut" },
    { value: "near_miss", label: "Near Miss" },
    { value: "equipment_failure", label: "Equipment Failure" },
    { value: "electrical", label: "Electrical" },
    { value: "struck_by", label: "Struck By" },
    { value: "caught_in", label: "Caught In" },
    { value: "other", label: "Other" },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incidentType || !description) {
      alert("Please fill in all required fields");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/safety/incidents/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          crewId,
          dailyLogId,
          incidentType,
          description,
          severity,
          photoUrl: photoUrl || null,
          requiresShutdown,
          occurredAt: new Date().toISOString(),
        }),
      });

      const data = await response.json();
      if (data.success) {
        onSubmit(data.incident);
        // Reset form
        setIncidentType("");
        setDescription("");
        setSeverity("low");
        setPhotoUrl("");
        setRequiresShutdown(false);
      } else {
        alert(data.error || "Failed to log incident");
      }
    } catch (error) {
      console.error("Error logging incident:", error);
      alert("Failed to log incident");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 p-4 bg-white rounded-lg shadow">
      <h3 className="text-lg font-semibold">Report Safety Incident</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            Incident Type <span className="text-red-500">*</span>
          </label>
          <select
            value={incidentType}
            onChange={(e) => setIncidentType(e.target.value)}
            className="w-full p-2 border rounded-md"
            required
          >
            <option value="">Select type...</option>
            {incidentTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Description <span className="text-red-500">*</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full p-2 border rounded-md"
            rows={4}
            placeholder="Describe what happened..."
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Severity</label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="w-full p-2 border rounded-md"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Photo URL (optional)</label>
          <input
            type="url"
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
            className="w-full p-2 border rounded-md"
            placeholder="https://..."
          />
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="checkbox"
            id="requiresShutdown"
            checked={requiresShutdown}
            onChange={(e) => setRequiresShutdown(e.target.checked)}
            className="w-4 h-4"
          />
          <label htmlFor="requiresShutdown" className="text-sm font-medium">
            Requires immediate work shutdown
          </label>
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? "Submitting..." : "Log Incident"}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

























