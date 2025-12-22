"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Download, FileText, Calendar, DollarSign, Activity } from "lucide-react";

interface DataExportSettingsProps {
  canEdit: boolean;
}

export default function DataExportSettings({ canEdit }: DataExportSettingsProps) {
  const [exportContacts, setExportContacts] = useState(true);
  const [exportTasks, setExportTasks] = useState(true);
  const [exportPipeline, setExportPipeline] = useState(true);
  const [exportQuotes, setExportQuotes] = useState(true);
  const [exportAppointments, setExportAppointments] = useState(true);
  const [exportActivityLogs, setExportActivityLogs] = useState(true);
  const [exportRevenueData, setExportRevenueData] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch("/api/settings/export");
      const data = await res.json();
      
      if (data.settings?.export) {
        const exportSettings = data.settings.export;
        setExportContacts(exportSettings.export_contacts !== false);
        setExportTasks(exportSettings.export_tasks !== false);
        setExportPipeline(exportSettings.export_pipeline !== false);
        setExportQuotes(exportSettings.export_quotes !== false);
        setExportAppointments(exportSettings.export_appointments !== false);
        setExportActivityLogs(exportSettings.export_activity_logs !== false);
        setExportRevenueData(exportSettings.export_revenue_data !== false);
      }
    } catch (error) {
      console.error("Failed to load export settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!canEdit) return;

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/settings/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          export: {
            export_contacts: exportContacts,
            export_tasks: exportTasks,
            export_pipeline: exportPipeline,
            export_quotes: exportQuotes,
            export_appointments: exportAppointments,
            export_activity_logs: exportActivityLogs,
            export_revenue_data: exportRevenueData,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Save failed");
      }

      setMessage("Export settings updated!");
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const downloadWorkspaceExport = async () => {
    setDownloading(true);
    setMessage(null);
    try {
      // Use a normal navigation so cookies/session are included and the browser downloads the file.
      window.location.href = "/api/settings/export/download";
    } finally {
      // We can't reliably know when the download completes; reset the UI state shortly after.
      setTimeout(() => setDownloading(false), 1500);
    }
  };

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-semibold mb-2">Data Export</h1>
        <p className="text-muted-foreground mb-6">Loading...</p>
      </div>
    );
  }

  const exportOptions = [
    { key: "contacts", label: "Contacts", icon: FileText, enabled: exportContacts, setter: setExportContacts },
    { key: "tasks", label: "Tasks", icon: FileText, enabled: exportTasks, setter: setExportTasks },
    { key: "pipeline", label: "Pipeline", icon: FileText, enabled: exportPipeline, setter: setExportPipeline },
    { key: "quotes", label: "Quotes", icon: FileText, enabled: exportQuotes, setter: setExportQuotes },
    { key: "appointments", label: "Appointments", icon: Calendar, enabled: exportAppointments, setter: setExportAppointments },
    { key: "activityLogs", label: "Activity Logs", icon: Activity, enabled: exportActivityLogs, setter: setExportActivityLogs },
    { key: "revenueData", label: "Revenue Data", icon: DollarSign, enabled: exportRevenueData, setter: setExportRevenueData },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Data Export</h1>
        <p className="text-sm text-gray-600">
          Export options: contacts, tasks, pipeline, quotes, appointments, activity logs, revenue data
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        {exportOptions.map((option) => {
          const Icon = option.icon;
          return (
            <div
              key={option.key}
              className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">{option.label}</span>
              </div>
              {canEdit && (
                <input
                  type="checkbox"
                  checked={option.enabled}
                  onChange={(e) => option.setter(e.target.checked)}
                  className="rounded"
                />
              )}
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

        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-gray-600">
            Download a full workspace export (JSON). This is your “if everything burned down” backup.
          </div>
          <Button onClick={downloadWorkspaceExport} disabled={downloading}>
            <Download className="h-4 w-4 mr-2" />
            {downloading ? "Preparing..." : "Download Export"}
          </Button>
        </div>

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




















































