"use client";

import { useState, useEffect } from "react";
import { Plus, CheckCircle, AlertTriangle, Clock, FileText } from "lucide-react";

interface PerformanceLog {
  id: string;
  log_type: string;
  notes: string;
  severity: string;
  created_at: string;
  employee: {
    first_name: string;
    last_name: string;
  };
}

export function PerformanceLogs() {
  const [logs, setLogs] = useState<PerformanceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    fetchLogs();
  }, [typeFilter]);

  async function fetchLogs() {
    try {
      const params = new URLSearchParams();
      if (typeFilter !== "all") params.append("log_type", typeFilter);

      const res = await fetch(`/api/workforce/performance?${params}`);
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (error) {
      console.error("Error fetching performance logs:", error);
    } finally {
      setLoading(false);
    }
  }

  function getLogIcon(type: string) {
    switch (type) {
      case "praise":
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case "issue":
      case "violation":
        return <AlertTriangle className="h-5 w-5 text-red-600" />;
      case "attendance":
        return <Clock className="h-5 w-5 text-yellow-600" />;
      default:
        return <FileText className="h-5 w-5 text-gray-600" />;
    }
  }

  function getSeverityBadge(severity: string) {
    const colors = {
      low: "bg-gray-100 text-gray-800",
      medium: "bg-yellow-100 text-yellow-800",
      high: "bg-orange-100 text-orange-800",
      critical: "bg-red-100 text-red-800",
    };
    return (
      <span
        className={`px-2 py-1 rounded text-xs font-medium ${
          colors[severity as keyof typeof colors] || colors.low
        }`}
      >
        {severity}
      </span>
    );
  }

  if (loading) {
    return <div className="text-center py-12">Loading performance logs...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Performance Logs</h2>
        <div className="flex items-center gap-4">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Types</option>
            <option value="praise">Praise</option>
            <option value="issue">Issue</option>
            <option value="attendance">Attendance</option>
            <option value="violation">Violation</option>
            <option value="review">Review</option>
            <option value="incident">Incident</option>
            <option value="note">Note</option>
          </select>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Plus className="h-4 w-4" />
            Add Log
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {logs.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No performance logs found
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="bg-white rounded-lg border p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start gap-4">
                <div className="mt-1">{getLogIcon(log.log_type)}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-medium">
                      {log.employee.first_name} {log.employee.last_name}
                    </span>
                    <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs capitalize">
                      {log.log_type}
                    </span>
                    {log.severity !== "low" && getSeverityBadge(log.severity)}
                    <span className="text-xs text-gray-500 ml-auto">
                      {new Date(log.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">{log.notes}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
























