// Block 22400 — SmartSend Roofing Permit & HOA Management v1
// Component: JobPermitsPanel
// Displays permit and HOA information for a job

"use client";

import useSWR from "swr";
import { AlertTriangle, CheckCircle, Clock, XCircle } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function JobPermitsPanel({ jobId }: { jobId: string }) {
  const { data, error, mutate } = useSWR(
    `/api/jobs/${jobId}/permits-hoa`,
    fetcher
  );

  if (!data && !error) {
    return (
      <div className="border rounded-lg p-4 bg-white dark:bg-zinc-950 border-zinc-800">
        <div className="animate-pulse space-y-2">
          <div className="h-4 w-32 bg-zinc-800 rounded"></div>
          <div className="h-20 w-full bg-zinc-800 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border rounded-lg p-4 bg-white dark:bg-zinc-950 border-zinc-800 text-red-600">
        Error loading permit and HOA information.
      </div>
    );
  }

  const { job, permits, hoa } = data;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved":
        return "text-green-600 dark:text-green-400";
      case "submitted":
        return "text-blue-600 dark:text-blue-400";
      case "denied":
        return "text-red-600 dark:text-red-400";
      case "required":
        return "text-yellow-600 dark:text-yellow-400";
      default:
        return "text-gray-600 dark:text-gray-400";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <CheckCircle className="w-4 h-4" />;
      case "submitted":
        return <Clock className="w-4 h-4" />;
      case "denied":
        return <XCircle className="w-4 h-4" />;
      case "required":
        return <AlertTriangle className="w-4 h-4" />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="border rounded-lg bg-white dark:bg-zinc-950 p-4 shadow-sm border-zinc-800 text-xs">
        <h3 className="font-semibold text-sm mb-2 text-zinc-50">
          Permit & HOA Summary
        </h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Permit Required:</span>
            <span className="font-semibold text-zinc-50">
              {job.permit_required ? "Yes" : "No"}
            </span>
          </div>
          {job.permit_required && (
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Permit Status:</span>
              <span
                className={`font-semibold flex items-center gap-1 ${getStatusColor(
                  job.permit_status || "not_set"
                )}`}
              >
                {getStatusIcon(job.permit_status || "not_set")}
                {job.permit_status || "not_set"}
              </span>
            </div>
          )}
          {job.permit_expiration && (
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Permit Expires:</span>
              <span className="font-semibold text-zinc-50">
                {new Date(job.permit_expiration).toLocaleDateString()}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-800">
            <span className="text-zinc-400">HOA Required:</span>
            <span className="font-semibold text-zinc-50">
              {job.hoa_required ? "Yes" : "No"}
            </span>
          </div>
          {job.hoa_required && (
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">HOA Status:</span>
              <span
                className={`font-semibold flex items-center gap-1 ${getStatusColor(
                  job.hoa_status || "not_set"
                )}`}
              >
                {getStatusIcon(job.hoa_status || "not_set")}
                {job.hoa_status || "not_set"}
              </span>
            </div>
          )}
          {job.hoa_name && (
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">HOA Name:</span>
              <span className="font-semibold text-zinc-50">
                {job.hoa_name}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Permits List */}
      <div className="border rounded-lg bg-white dark:bg-zinc-950 p-4 shadow-sm border-zinc-800 text-xs">
        <h3 className="font-semibold text-sm mb-2 text-zinc-50">Permits</h3>
        {permits.length === 0 && (
          <p className="text-gray-500 dark:text-zinc-500 text-xs">
            No permits recorded.
          </p>
        )}
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {permits.map((p: any) => (
            <div
              key={p.id}
              className="border rounded p-2 border-zinc-800 bg-zinc-900"
            >
              <p className="font-semibold text-zinc-50">
                {p.permit_type?.toUpperCase() || "PERMIT"} —{" "}
                {p.jurisdiction || "Jurisdiction not set"}
              </p>
              <p className="text-[11px] text-gray-400 dark:text-zinc-400 mt-1">
                Permit #: {p.permit_number || "—"}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[11px] text-gray-400 dark:text-zinc-400">
                  Status:
                </span>
                <span
                  className={`text-[11px] font-semibold flex items-center gap-1 ${getStatusColor(
                    p.status
                  )}`}
                >
                  {getStatusIcon(p.status)}
                  {p.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-1 text-[11px] text-gray-400 dark:text-zinc-400">
                <div>
                  Submitted: {p.submitted_date || "—"}
                </div>
                <div>
                  Approved: {p.approved_date || "—"}
                </div>
                <div>
                  Expiration: {p.expiration_date || "—"}
                </div>
                <div>
                  Fee: ${p.fee_amount || 0}
                </div>
              </div>
              {p.notes && (
                <p className="text-[11px] text-gray-500 dark:text-zinc-500 mt-1">
                  {p.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* HOA Section */}
      <div className="border rounded-lg bg-white dark:bg-zinc-950 p-4 shadow-sm border-zinc-800 text-xs">
        <h3 className="font-semibold text-sm mb-2 text-zinc-50">
          HOA Approval
        </h3>
        {hoa.length === 0 && (
          <p className="text-gray-500 dark:text-zinc-500 text-xs">
            No HOA request recorded.
          </p>
        )}
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {hoa.map((h: any) => (
            <div
              key={h.id}
              className="border rounded p-2 border-zinc-800 bg-zinc-900"
            >
              <p className="font-semibold text-zinc-50">
                {h.hoa_name || "HOA"}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[11px] text-gray-400 dark:text-zinc-400">
                  Status:
                </span>
                <span
                  className={`text-[11px] font-semibold flex items-center gap-1 ${getStatusColor(
                    h.status
                  )}`}
                >
                  {getStatusIcon(h.status)}
                  {h.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-1 text-[11px] text-gray-400 dark:text-zinc-400">
                <div>
                  Submitted: {h.submitted_date || "—"}
                </div>
                <div>
                  Approved: {h.approved_date || "—"}
                </div>
              </div>
              {h.contact_email && (
                <p className="text-[11px] text-gray-400 dark:text-zinc-400 mt-1">
                  Email: {h.contact_email}
                </p>
              )}
              {h.contact_phone && (
                <p className="text-[11px] text-gray-400 dark:text-zinc-400">
                  Phone: {h.contact_phone}
                </p>
              )}
              {h.notes && (
                <p className="text-[11px] text-gray-500 dark:text-zinc-500 mt-1">
                  {h.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}








































