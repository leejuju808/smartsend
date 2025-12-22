"use client";

// Block 251700 — SmartSend Crew Issue Reporting System v1
// Production Manager Dashboard: Issues Overview
// app/workforce/issues/page.tsx

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Filter, Eye } from "lucide-react";

interface Issue {
  id: string;
  issue_type: string;
  severity: string;
  title: string;
  status: string;
  reported_at: string;
  jobs?: {
    id: string;
    job_name?: string;
    title?: string;
    address?: string;
  } | null;
  workforce_employees?: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-300",
  high: "bg-orange-100 text-orange-800 border-orange-300",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-300",
  low: "bg-gray-100 text-gray-800 border-gray-300",
};

const SEVERITY_ORDER = ["critical", "high", "medium", "low"];

export default function IssuesDashboardPage() {
  const router = useRouter();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  useEffect(() => {
    loadIssues();
  }, [statusFilter, severityFilter, typeFilter]);

  const loadIssues = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (severityFilter !== "all") params.append("severity", severityFilter);
      if (typeFilter !== "all") params.append("issue_type", typeFilter);

      const res = await fetch(`/api/workforce/issues/list?${params.toString()}`);
      const data = await res.json();
      setIssues(data.issues || []);
    } catch (error) {
      console.error("Error loading issues:", error);
    } finally {
      setLoading(false);
    }
  };

  // Sort issues by severity (critical first)
  const sortedIssues = [...issues].sort((a, b) => {
    const aIndex = SEVERITY_ORDER.indexOf(a.severity);
    const bIndex = SEVERITY_ORDER.indexOf(b.severity);
    return aIndex - bIndex;
  });

  const getSeverityBadge = (severity: string) => {
    return (
      <span
        className={`px-2 py-1 rounded text-xs font-semibold border ${SEVERITY_COLORS[severity] || SEVERITY_COLORS.low}`}
      >
        {severity.toUpperCase()}
      </span>
    );
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      material: "Material",
      safety: "Safety",
      damage: "Damage",
      customer: "Customer",
      weather: "Weather",
      other: "Other",
    };
    return labels[type] || type;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center text-gray-500">Loading issues...</div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Crew Issues</h1>
          <p className="mt-1 text-sm text-gray-500">
            Monitor and resolve field issues in real-time
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Filters:</span>
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="all">All Status</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </select>

          {/* Severity Filter */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="all">All Severity</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="all">All Types</option>
            <option value="material">Material</option>
            <option value="safety">Safety</option>
            <option value="damage">Damage</option>
            <option value="customer">Customer</option>
            <option value="weather">Weather</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      {/* Issues Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Severity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Title
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Job #
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Employee
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedIssues.map((issue) => (
                <tr key={issue.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getSeverityBadge(issue.severity)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-900">
                      {getTypeLabel(issue.issue_type)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">
                      {issue.title}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-500">
                      {issue.jobs?.job_name || issue.jobs?.title || "—"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-500">
                      {issue.workforce_employees
                        ? `${issue.workforce_employees.first_name} ${issue.workforce_employees.last_name}`
                        : "—"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-500">
                      {formatDate(issue.reported_at)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        issue.status === "resolved"
                          ? "bg-green-100 text-green-800"
                          : issue.status === "in_progress"
                          ? "bg-blue-100 text-blue-800"
                          : issue.status === "dismissed"
                          ? "bg-gray-100 text-gray-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {issue.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link
                      href={`/workforce/issues/${issue.id}`}
                      className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                    >
                      <Eye className="w-4 h-4" />
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {sortedIssues.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-sm text-gray-500">
                    No issues found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
























