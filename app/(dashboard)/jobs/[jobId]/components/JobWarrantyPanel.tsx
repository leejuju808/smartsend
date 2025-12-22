"use client";

// Block 22360 — SmartSend Roofing Warranty & Service Tracking v1
// Job Warranty Panel Component

import { useEffect, useState } from "react";

interface Warranty {
  id: string;
  type: string;
  provider_name: string | null;
  warranty_number: string | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
}

interface ServiceCall {
  id: string;
  issue_type: string;
  status: string;
  requested_at: string;
  scheduled_date: string | null;
  under_warranty_at_time: boolean | null;
  description: string | null;
  resolution_notes: string | null;
}

interface WarrantyData {
  job: {
    id: string;
    title: string | null;
    workmanship_warranty_expiration: string | null;
    material_warranty_expiration: string | null;
    has_active_warranty: boolean;
  };
  warranties: Warranty[];
  calls: ServiceCall[];
}

export function JobWarrantyPanel({ jobId }: { jobId: string }) {
  const [data, setData] = useState<WarrantyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchWarrantyData() {
      try {
        setLoading(true);
        const response = await fetch(`/api/jobs/${jobId}/warranty`);
        if (!response.ok) {
          throw new Error("Failed to load warranty data");
        }
        const json = await response.json();
        setData(json);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    fetchWarrantyData();
  }, [jobId]);

  if (loading) {
    return (
      <div className="border rounded-lg p-4 bg-white">
        <div className="text-xs text-gray-500">Loading warranty…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border rounded-lg p-4 bg-white text-red-600 text-xs">
        Error loading warranty data: {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="border rounded-lg p-4 bg-white text-xs text-gray-500">
        No warranty data available.
      </div>
    );
  }

  const { job, warranties, calls } = data;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="border rounded-lg bg-white p-4 shadow-sm text-xs">
        <h3 className="font-semibold text-sm mb-1">Warranty Summary</h3>
        <p>
          Workmanship exp:{" "}
          <span className="font-semibold">
            {job.workmanship_warranty_expiration || "—"}
          </span>
        </p>
        <p>
          Material exp:{" "}
          <span className="font-semibold">
            {job.material_warranty_expiration || "—"}
          </span>
        </p>
        <p className="mt-1">
          Status:{" "}
          <span
            className={`font-semibold ${
              job.has_active_warranty ? "text-emerald-700" : "text-gray-500"
            }`}
          >
            {job.has_active_warranty ? "Under Warranty" : "Out of Warranty"}
          </span>
        </p>
      </div>

      {/* Warranties */}
      <div className="border rounded-lg bg-white p-4 shadow-sm text-xs">
        <h3 className="font-semibold text-sm mb-2">Warranty Details</h3>
        {warranties.length === 0 && (
          <p className="text-gray-500 text-xs">No warranties recorded for this job.</p>
        )}
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {warranties.map((w) => (
            <div key={w.id} className="border rounded p-2">
              <p className="font-semibold">
                {w.type.toUpperCase()} • {w.provider_name || "Provider not set"}
              </p>
              <p className="text-[11px] text-gray-600">
                Start: {w.start_date || "—"} • End: {w.end_date || "—"}
              </p>
              {w.warranty_number && (
                <p className="text-[11px] text-gray-500">
                  Warranty #: {w.warranty_number}
                </p>
              )}
              {w.notes && (
                <p className="text-[11px] text-gray-500 mt-1">{w.notes}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Service Calls */}
      <div className="border rounded-lg bg-white p-4 shadow-sm text-xs">
        <h3 className="font-semibold text-sm mb-2">Service History</h3>
        {calls.length === 0 && (
          <p className="text-gray-500 text-xs">No service calls for this job.</p>
        )}
        <div className="max-h-40 overflow-y-auto space-y-2">
          {calls.map((c) => (
            <div key={c.id} className="border rounded p-2">
              <p className="font-semibold">
                {c.issue_type} • {c.status}
              </p>
              <p className="text-[11px] text-gray-600">
                Requested:{" "}
                {c.requested_at
                  ? new Date(c.requested_at).toLocaleDateString()
                  : "—"}
                {c.scheduled_date && ` • Scheduled: ${c.scheduled_date}`}
              </p>
              <p className="text-[11px] text-gray-600">
                Warranty at time: {c.under_warranty_at_time ? "Yes" : "No"}
              </p>
              {c.description && (
                <p className="text-[11px] text-gray-500 mt-1">{c.description}</p>
              )}
              {c.resolution_notes && (
                <p className="text-[11px] text-emerald-700 mt-1">
                  Resolution: {c.resolution_notes}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

