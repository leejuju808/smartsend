"use client";

import { useState, useEffect } from "react";
import { Plus, AlertTriangle, Calendar, CheckCircle2 } from "lucide-react";

interface CertificationStatus {
  employee_id: string;
  certification_id: string;
  first_name: string;
  last_name: string;
  role: string | null;
  cert_name: string;
  cert_type: string;
  issue_date: string;
  expiry_date: string | null;
  status: "valid" | "expired" | "expiring_7" | "expiring_30" | "unknown";
}

interface ComplianceSummary {
  expired: number;
  expiring_7: number;
  expiring_30: number;
  valid: number;
  unknown: number;
}

export function CertificationsManager() {
  const [certifications, setCertifications] = useState<CertificationStatus[]>([]);
  const [summary, setSummary] = useState<ComplianceSummary>({
    expired: 0,
    expiring_7: 0,
    expiring_30: 0,
    valid: 0,
    unknown: 0,
  });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  useEffect(() => {
    fetchCertifications();
  }, [statusFilter]);

  async function fetchCertifications() {
    try {
      const params = new URLSearchParams();
      params.append("type", "certifications");

      const res = await fetch(`/api/workforce/compliance?${params}`);
      const data = await res.json();
      
      let certs = data.certifications || [];
      
      // Apply status filter if set
      if (statusFilter) {
        certs = certs.filter((c: CertificationStatus) => c.status === statusFilter);
      }
      
      setCertifications(certs);
      setSummary(data.summary || summary);
    } catch (error) {
      console.error("Error fetching certifications:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="text-center py-12">Loading certifications...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Certifications Monitor</h2>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Plus className="h-4 w-4" />
          Add Certification
        </button>
      </div>

      {/* Summary Chips */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setStatusFilter(statusFilter === "expired" ? null : "expired")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            statusFilter === "expired"
              ? "bg-red-600 text-white"
              : "bg-red-100 text-red-800 hover:bg-red-200"
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          Expired: {summary.expired}
        </button>
        <button
          onClick={() => setStatusFilter(statusFilter === "expiring_7" ? null : "expiring_7")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            statusFilter === "expiring_7"
              ? "bg-orange-600 text-white"
              : "bg-orange-100 text-orange-800 hover:bg-orange-200"
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          Expiring (7 days): {summary.expiring_7}
        </button>
        <button
          onClick={() => setStatusFilter(statusFilter === "expiring_30" ? null : "expiring_30")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            statusFilter === "expiring_30"
              ? "bg-yellow-600 text-white"
              : "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          Expiring (30 days): {summary.expiring_30}
        </button>
        <button
          onClick={() => setStatusFilter(statusFilter === "valid" ? null : "valid")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            statusFilter === "valid"
              ? "bg-green-600 text-white"
              : "bg-green-100 text-green-800 hover:bg-green-200"
          }`}
        >
          <CheckCircle2 className="h-4 w-4" />
          Valid: {summary.valid}
        </button>
        {summary.unknown > 0 && (
          <button
            onClick={() => setStatusFilter(statusFilter === "unknown" ? null : "unknown")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === "unknown"
                ? "bg-gray-600 text-white"
                : "bg-gray-100 text-gray-800 hover:bg-gray-200"
            }`}
          >
            Unknown: {summary.unknown}
          </button>
        )}
        {statusFilter && (
          <button
            onClick={() => setStatusFilter(null)}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-200 text-gray-700 hover:bg-gray-300"
          >
            Clear Filter
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Employee
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Certification
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Issue Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Expiry Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {certifications.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  {statusFilter
                    ? `No certifications with status: ${statusFilter}`
                    : "No certifications found"}
                </td>
              </tr>
            ) : (
              certifications.map((cert) => {
                const getStatusBadge = () => {
                  switch (cert.status) {
                    case "expired":
                      return (
                        <span className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-medium">
                          <AlertTriangle className="h-3 w-3" />
                          Expired
                        </span>
                      );
                    case "expiring_7":
                      return (
                        <span className="flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs font-medium">
                          <AlertTriangle className="h-3 w-3" />
                          Expiring (7 days)
                        </span>
                      );
                    case "expiring_30":
                      return (
                        <span className="flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-medium">
                          <AlertTriangle className="h-3 w-3" />
                          Expiring (30 days)
                        </span>
                      );
                    case "valid":
                      return (
                        <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
                          <CheckCircle2 className="h-3 w-3" />
                          Valid
                        </span>
                      );
                    default:
                      return (
                        <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">
                          Unknown
                        </span>
                      );
                  }
                };

                return (
                  <tr key={`${cert.employee_id}-${cert.certification_id}`} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      {cert.first_name} {cert.last_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">
                      {cert.role || "—"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {cert.cert_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs capitalize">
                        {cert.cert_type?.replace("_", " ") || "other"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(cert.issue_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {cert.expiry_date
                        ? new Date(cert.expiry_date).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge()}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
