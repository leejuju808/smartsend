"use client";

// Block 32277 — SmartSend Roofing Warranty Tracker + Service Visit Automation v1
// Warranty Dashboard UI

import { useEffect, useState } from "react";
import Link from "next/link";

interface Warranty {
  id: string;
  expiration_date: string;
  job: {
    id: string;
    title: string | null;
  } | null;
  homeowner: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    city: string | null;
  } | null;
}

interface Inspection {
  id: string;
  due_date: string;
  completed: boolean;
  warranty: {
    id: string;
    job: {
      id: string;
      title: string | null;
    } | null;
    homeowner: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      city: string | null;
    } | null;
  };
}

interface WarrantyClaim {
  id: string;
  issue: string;
  status: string;
  created_at: string;
  warranty: {
    id: string;
    job: {
      id: string;
      title: string | null;
    } | null;
    homeowner: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      city: string | null;
    } | null;
  };
}

interface ServiceVisit {
  id: string;
  scheduled_for: string | null;
  technician: string | null;
  completed: boolean;
  warranty: {
    id: string;
    job: {
      id: string;
      title: string | null;
    } | null;
    homeowner: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      city: string | null;
    } | null;
  };
}

interface WarrantyDashboardData {
  active_warranties: Warranty[];
  expiring_warranties: Warranty[];
  inspections_due: Inspection[];
  open_claims: WarrantyClaim[];
  scheduled_visits: ServiceVisit[];
  totals: {
    active: number;
    expiring: number;
    inspections_due: number;
    open_claims: number;
    scheduled_visits: number;
  };
}

export default function WarrantyDashboard() {
  const [data, setData] = useState<WarrantyDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchWarrantyData() {
      try {
        setLoading(true);
        const response = await fetch("/api/dashboard/warranty");
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
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-gray-500">Loading warranty dashboard…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-sm text-red-600">Error loading data: {error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <div className="text-sm text-gray-500">No data available.</div>
      </div>
    );
  }

  const {
    active_warranties,
    expiring_warranties,
    inspections_due,
    open_claims,
    scheduled_visits,
    totals,
  } = data;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Warranty Center</h1>
          <p className="text-sm text-gray-500">
            Track warranties, inspections, claims, and service visits
          </p>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="border rounded-lg bg-white p-4 shadow-sm">
          <div className="text-2xl font-bold">{totals.active}</div>
          <div className="text-sm text-gray-600">Active Warranties</div>
        </div>
        <div className="border rounded-lg bg-white p-4 shadow-sm bg-amber-50">
          <div className="text-2xl font-bold text-amber-700">{totals.expiring}</div>
          <div className="text-sm text-gray-600">Expiring (90 days)</div>
        </div>
        <div className="border rounded-lg bg-white p-4 shadow-sm bg-blue-50">
          <div className="text-2xl font-bold text-blue-700">{totals.inspections_due}</div>
          <div className="text-sm text-gray-600">Inspections Due</div>
        </div>
        <div className="border rounded-lg bg-white p-4 shadow-sm bg-red-50">
          <div className="text-2xl font-bold text-red-700">{totals.open_claims}</div>
          <div className="text-sm text-gray-600">Open Claims</div>
        </div>
        <div className="border rounded-lg bg-white p-4 shadow-sm bg-green-50">
          <div className="text-2xl font-bold text-green-700">{totals.scheduled_visits}</div>
          <div className="text-sm text-gray-600">Scheduled Visits</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Warranties */}
        <section className="border rounded-lg bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-lg mb-4">Active Warranties</h2>
          <div className="max-h-96 overflow-y-auto space-y-2">
            {active_warranties.length === 0 && (
              <p className="text-gray-500 text-sm">No active warranties.</p>
            )}
            {active_warranties.map((w) => (
              <Link
                key={w.id}
                href={`/dashboard/warranty/${w.id}`}
                className="block border rounded p-3 hover:bg-gray-50 transition-colors"
              >
                <p className="font-semibold truncate">
                  {w.job?.title || "Roof Job"}
                </p>
                <p className="text-sm text-gray-600">
                  {w.homeowner?.first_name} {w.homeowner?.last_name}
                  {w.homeowner?.city && ` • ${w.homeowner.city}`}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Expires: {formatDate(w.expiration_date)}
                </p>
              </Link>
            ))}
          </div>
        </section>

        {/* Expiring Soon */}
        <section className="border rounded-lg bg-white p-4 shadow-sm bg-amber-50">
          <h2 className="font-semibold text-lg mb-4">Expiring Soon (Next 90 Days)</h2>
          <div className="max-h-96 overflow-y-auto space-y-2">
            {expiring_warranties.length === 0 && (
              <p className="text-gray-500 text-sm">No warranties expiring soon.</p>
            )}
            {expiring_warranties.map((w) => (
              <Link
                key={w.id}
                href={`/dashboard/warranty/${w.id}`}
                className="block border rounded p-3 bg-white hover:bg-amber-100 transition-colors"
              >
                <p className="font-semibold truncate">
                  {w.job?.title || "Roof Job"}
                </p>
                <p className="text-sm text-gray-600">
                  {w.homeowner?.first_name} {w.homeowner?.last_name}
                  {w.homeowner?.city && ` • ${w.homeowner.city}`}
                </p>
                <p className="text-xs text-amber-700 mt-1 font-medium">
                  Expires: {formatDate(w.expiration_date)}
                </p>
              </Link>
            ))}
          </div>
        </section>

        {/* Inspections Due This Month */}
        <section className="border rounded-lg bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-lg mb-4">Inspections Due This Month</h2>
          <div className="max-h-96 overflow-y-auto space-y-2">
            {inspections_due.length === 0 && (
              <p className="text-gray-500 text-sm">No inspections due this month.</p>
            )}
            {inspections_due.map((i) => (
              <Link
                key={i.id}
                href={`/dashboard/warranty/${i.warranty.id}`}
                className="block border rounded p-3 hover:bg-gray-50 transition-colors"
              >
                <p className="font-semibold truncate">
                  {i.warranty.job?.title || "Roof Job"}
                </p>
                <p className="text-sm text-gray-600">
                  {i.warranty.homeowner?.first_name} {i.warranty.homeowner?.last_name}
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  Due: {formatDate(i.due_date)}
                </p>
              </Link>
            ))}
          </div>
        </section>

        {/* Open Warranty Claims */}
        <section className="border rounded-lg bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-lg mb-4">Open Warranty Claims</h2>
          <div className="max-h-96 overflow-y-auto space-y-2">
            {open_claims.length === 0 && (
              <p className="text-gray-500 text-sm">No open warranty claims.</p>
            )}
            {open_claims.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard/warranty/${c.warranty.id}`}
                className="block border rounded p-3 hover:bg-gray-50 transition-colors"
              >
                <p className="font-semibold truncate">
                  {c.warranty.job?.title || "Roof Job"}
                </p>
                <p className="text-sm text-gray-600">
                  {c.warranty.homeowner?.first_name} {c.warranty.homeowner?.last_name}
                </p>
                <p className="text-xs text-red-600 mt-1">
                  Issue: {c.issue} • {formatDate(c.created_at)}
                </p>
              </Link>
            ))}
          </div>
        </section>

        {/* Scheduled Service Visits */}
        <section className="border rounded-lg bg-white p-4 shadow-sm lg:col-span-2">
          <h2 className="font-semibold text-lg mb-4">Scheduled Service Visits</h2>
          <div className="max-h-96 overflow-y-auto space-y-2">
            {scheduled_visits.length === 0 && (
              <p className="text-gray-500 text-sm">No scheduled service visits.</p>
            )}
            {scheduled_visits.map((v) => (
              <Link
                key={v.id}
                href={`/dashboard/warranty/${v.warranty.id}`}
                className="block border rounded p-3 hover:bg-gray-50 transition-colors"
              >
                <p className="font-semibold truncate">
                  {v.warranty.job?.title || "Roof Job"}
                </p>
                <p className="text-sm text-gray-600">
                  {v.warranty.homeowner?.first_name} {v.warranty.homeowner?.last_name}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {v.scheduled_for
                    ? `Scheduled: ${formatDate(v.scheduled_for)}`
                    : "Not scheduled"}
                  {v.technician && ` • Tech: ${v.technician}`}
                </p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

