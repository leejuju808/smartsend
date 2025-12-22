"use client";

// Block 22400 — SmartSend Roofing Permit & HOA Management v1
// Permit & HOA Dashboard UI

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Calendar, CheckCircle, XCircle } from "lucide-react";

interface RiskyJob {
  id: string;
  title: string | null;
  status: string | null;
  scheduled_start_date: string | null;
  permit_required: boolean;
  permit_status: string | null;
  hoa_required: boolean;
  hoa_status: string | null;
  lead: {
    first_name: string | null;
    last_name: string | null;
    city: string | null;
  } | null;
}

interface ExpiringPermit {
  id: string;
  job_id: string;
  permit_type: string | null;
  jurisdiction: string | null;
  permit_number: string | null;
  expiration_date: string | null;
  job: {
    title: string | null;
    lead: {
      first_name: string | null;
      last_name: string | null;
      city: string | null;
    } | null;
  } | null;
}

interface PermitsDashboardData {
  riskyJobs: RiskyJob[];
  expiringPermits: ExpiringPermit[];
}

export default function PermitsDashboard() {
  const [data, setData] = useState<PermitsDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPermitsData() {
      try {
        setLoading(true);
        const response = await fetch("/api/dashboard/permits");
        if (!response.ok) {
          throw new Error("Failed to load permits data");
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

    fetchPermitsData();
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-gray-500 dark:text-zinc-400">
          Loading permits dashboard…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-sm text-red-600 dark:text-red-400">
          Error loading data: {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <div className="text-sm text-gray-500 dark:text-zinc-400">
          No data available.
        </div>
      </div>
    );
  }

  const { riskyJobs, expiringPermits } = data;

  const getStatusBadge = (status: string | null, required: boolean) => {
    if (!required || !status || status === "not_required") {
      return null;
    }
    const colors: Record<string, string> = {
      approved: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      submitted: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      denied: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      required: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    };
    return (
      <span
        className={`text-[10px] px-1.5 py-0.5 rounded ${colors[status] || "bg-gray-100 text-gray-800"}`}
      >
        {status}
      </span>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-50">
            Permit & HOA Dashboard
          </h1>
          <p className="text-xs text-gray-500 dark:text-zinc-400">
            Track permits, HOA approvals, and expiring authorizations.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risky Jobs - Scheduled Without Approval */}
        <section className="border rounded-lg bg-white dark:bg-zinc-950 p-4 shadow-sm border-zinc-800 text-xs lg:col-span-1">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
            <h2 className="font-semibold text-sm text-zinc-50">
              Jobs Scheduled Without Approval (RED)
            </h2>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-zinc-400 mb-3">
            These jobs are scheduled but still need permit or HOA approval. Risk of shutdown.
          </p>
          <div className="max-h-96 overflow-y-auto space-y-2">
            {riskyJobs.length === 0 && (
              <p className="text-gray-500 dark:text-zinc-500 text-xs">
                No risky jobs found. All scheduled jobs have required approvals.
              </p>
            )}
            {riskyJobs.map((job) => (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                className="block border rounded p-2 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900 hover:bg-red-100 dark:hover:bg-red-950/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate text-zinc-900 dark:text-zinc-50">
                      {job.title || "Roof Job"}
                    </p>
                    <p className="text-[11px] text-gray-600 dark:text-zinc-400 mt-1">
                      {job.lead?.first_name} {job.lead?.last_name} • {job.lead?.city}
                    </p>
                    {job.scheduled_start_date && (
                      <p className="text-[11px] text-gray-600 dark:text-zinc-400 mt-1 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Scheduled: {new Date(job.scheduled_start_date).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    {job.permit_required && (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-600 dark:text-zinc-400">Permit:</span>
                        {getStatusBadge(job.permit_status, job.permit_required)}
                      </div>
                    )}
                    {job.hoa_required && (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-gray-600 dark:text-zinc-400">HOA:</span>
                        {getStatusBadge(job.hoa_status, job.hoa_required)}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Expiring Permits */}
        <section className="border rounded-lg bg-white dark:bg-zinc-950 p-4 shadow-sm border-zinc-800 text-xs lg:col-span-1">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
            <h2 className="font-semibold text-sm text-zinc-50">
              Permits Expiring Soon (Next 30 Days)
            </h2>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-zinc-400 mb-3">
            Permits expiring within the next 30 days. Renew before expiration.
          </p>
          <div className="max-h-96 overflow-y-auto space-y-2">
            {expiringPermits.length === 0 && (
              <p className="text-gray-500 dark:text-zinc-500 text-xs">
                No permits expiring soon.
              </p>
            )}
            {expiringPermits.map((permit) => (
              <Link
                key={permit.id}
                href={`/jobs/${permit.job_id}`}
                className="block border rounded p-2 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900 hover:bg-amber-100 dark:hover:bg-amber-950/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate text-zinc-900 dark:text-zinc-50">
                      {permit.permit_type?.toUpperCase() || "PERMIT"} — {permit.jurisdiction || "Jurisdiction"}
                    </p>
                    <p className="text-[11px] text-gray-600 dark:text-zinc-400 mt-1">
                      {permit.job?.lead?.first_name} {permit.job?.lead?.last_name} • {permit.job?.lead?.city}
                    </p>
                    {permit.permit_number && (
                      <p className="text-[11px] text-gray-600 dark:text-zinc-400 mt-1">
                        Permit #: {permit.permit_number}
                      </p>
                    )}
                    {permit.expiration_date && (
                      <p className="text-[11px] text-red-600 dark:text-red-400 mt-1 flex items-center gap-1 font-semibold">
                        <Calendar className="w-3 h-3" />
                        Expires: {new Date(permit.expiration_date).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}








































