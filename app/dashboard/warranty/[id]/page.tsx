"use client";

// Block 32277 — SmartSend Roofing Warranty Tracker v1
// Warranty Detail Page

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface Warranty {
  id: string;
  warranty_type: string;
  start_date: string;
  expiration_date: string;
  inspection_frequency: number;
  notes: string | null;
  job: {
    id: string;
    stage: string;
    contract_value: number | null;
    notes: string | null;
  } | null;
  homeowner: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
  } | null;
  inspections: Array<{
    id: string;
    due_date: string;
    completed: boolean;
    completed_at: string | null;
    notes: string | null;
  }>;
  claims: Array<{
    id: string;
    issue: string;
    homeowner_message: string | null;
    status: string;
    technician: string | null;
    scheduled_for: string | null;
    resolution: string | null;
    created_at: string;
  }>;
  service_visits: Array<{
    id: string;
    scheduled_for: string | null;
    technician: string | null;
    notes: string | null;
    completed: boolean;
    completed_at: string | null;
  }>;
}

export default function WarrantyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const warrantyId = params.id as string;

  const [warranty, setWarranty] = useState<Warranty | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchWarranty() {
      try {
        setLoading(true);
        const response = await fetch(`/api/warranties/${warrantyId}`);
        if (!response.ok) {
          throw new Error("Failed to load warranty");
        }
        const json = await response.json();
        setWarranty(json.warranty);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    if (warrantyId) {
      fetchWarranty();
    }
  }, [warrantyId]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatDateShort = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-gray-500">Loading warranty details…</div>
      </div>
    );
  }

  if (error || !warranty) {
    return (
      <div className="p-6">
        <div className="text-sm text-red-600">
          Error: {error || "Warranty not found"}
        </div>
        <Link href="/dashboard/warranty" className="text-blue-600 hover:underline mt-2 inline-block">
          ← Back to Warranty Center
        </Link>
      </div>
    );
  }

  const daysUntilExpiration = Math.ceil(
    (new Date(warranty.expiration_date).getTime() - new Date().getTime()) /
      (1000 * 60 * 60 * 24)
  );

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <Link
            href="/dashboard/warranty"
            className="text-sm text-blue-600 hover:underline mb-2 inline-block"
          >
            ← Back to Warranty Center
          </Link>
          <h1 className="text-2xl font-semibold">Warranty Details</h1>
          <p className="text-sm text-gray-500">
            {warranty.homeowner?.first_name} {warranty.homeowner?.last_name}
            {warranty.job && ` • ${warranty.job.stage}`}
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-500">Warranty Status</div>
          <div
            className={`text-lg font-semibold ${
              daysUntilExpiration > 90
                ? "text-green-600"
                : daysUntilExpiration > 0
                ? "text-amber-600"
                : "text-red-600"
            }`}
          >
            {daysUntilExpiration > 0
              ? `${daysUntilExpiration} days remaining`
              : "Expired"}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Warranty Timeline */}
          <section className="border rounded-lg bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-lg mb-4">Warranty Timeline</h2>
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-2 h-2 rounded-full bg-blue-500 mt-2"></div>
                <div>
                  <div className="font-medium">Warranty Started</div>
                  <div className="text-sm text-gray-500">
                    {formatDate(warranty.start_date)}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    Type: {warranty.warranty_type}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div
                  className={`w-2 h-2 rounded-full mt-2 ${
                    daysUntilExpiration > 0 ? "bg-amber-500" : "bg-red-500"
                  }`}
                ></div>
                <div>
                  <div className="font-medium">Warranty Expires</div>
                  <div className="text-sm text-gray-500">
                    {formatDate(warranty.expiration_date)}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Inspection History */}
          <section className="border rounded-lg bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-lg mb-4">Inspection History</h2>
            <div className="space-y-3">
              {warranty.inspections.length === 0 && (
                <p className="text-gray-500 text-sm">No inspections scheduled yet.</p>
              )}
              {warranty.inspections.map((inspection) => (
                <div
                  key={inspection.id}
                  className="flex items-center justify-between p-3 border rounded"
                >
                  <div>
                    <div className="font-medium">
                      {inspection.completed ? "✓ Completed" : "Scheduled"}
                    </div>
                    <div className="text-sm text-gray-500">
                      Due: {formatDateShort(inspection.due_date)}
                    </div>
                    {inspection.completed_at && (
                      <div className="text-xs text-gray-400">
                        Completed: {formatDateShort(inspection.completed_at)}
                      </div>
                    )}
                  </div>
                  {inspection.completed && (
                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">
                      Done
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Service Visits */}
          <section className="border rounded-lg bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-lg mb-4">Service Visits</h2>
            <div className="space-y-3">
              {warranty.service_visits.length === 0 && (
                <p className="text-gray-500 text-sm">No service visits scheduled.</p>
              )}
              {warranty.service_visits.map((visit) => (
                <div
                  key={visit.id}
                  className="flex items-center justify-between p-3 border rounded"
                >
                  <div>
                    <div className="font-medium">
                      {visit.completed ? "✓ Completed" : "Scheduled"}
                    </div>
                    {visit.scheduled_for && (
                      <div className="text-sm text-gray-500">
                        {formatDateShort(visit.scheduled_for)}
                      </div>
                    )}
                    {visit.technician && (
                      <div className="text-xs text-gray-400">
                        Technician: {visit.technician}
                      </div>
                    )}
                    {visit.notes && (
                      <div className="text-xs text-gray-500 mt-1">{visit.notes}</div>
                    )}
                  </div>
                  {visit.completed ? (
                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">
                      Done
                    </span>
                  ) : (
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                      Pending
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Warranty Claims */}
          <section className="border rounded-lg bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-lg mb-4">Warranty Claims</h2>
            <div className="space-y-3">
              {warranty.claims.length === 0 && (
                <p className="text-gray-500 text-sm">No warranty claims.</p>
              )}
              {warranty.claims.map((claim) => (
                <div key={claim.id} className="p-3 border rounded">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium">{claim.issue}</div>
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        claim.status === "resolved"
                          ? "bg-green-100 text-green-700"
                          : claim.status === "denied"
                          ? "bg-red-100 text-red-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {claim.status}
                    </span>
                  </div>
                  {claim.homeowner_message && (
                    <div className="text-sm text-gray-600 mb-2">
                      {claim.homeowner_message}
                    </div>
                  )}
                  <div className="text-xs text-gray-500">
                    Created: {formatDateShort(claim.created_at)}
                    {claim.technician && ` • Tech: ${claim.technician}`}
                    {claim.scheduled_for && ` • Scheduled: ${formatDateShort(claim.scheduled_for)}`}
                  </div>
                  {claim.resolution && (
                    <div className="text-sm text-gray-700 mt-2 p-2 bg-gray-50 rounded">
                      Resolution: {claim.resolution}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Homeowner Info */}
          <section className="border rounded-lg bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-lg mb-4">Homeowner</h2>
            <div className="space-y-2 text-sm">
              <div>
                <div className="text-gray-500">Name</div>
                <div className="font-medium">
                  {warranty.homeowner?.first_name} {warranty.homeowner?.last_name}
                </div>
              </div>
              {warranty.homeowner?.email && (
                <div>
                  <div className="text-gray-500">Email</div>
                  <div className="font-medium">{warranty.homeowner.email}</div>
                </div>
              )}
              {warranty.homeowner?.phone && (
                <div>
                  <div className="text-gray-500">Phone</div>
                  <div className="font-medium">{warranty.homeowner.phone}</div>
                </div>
              )}
              {warranty.homeowner?.address && (
                <div>
                  <div className="text-gray-500">Address</div>
                  <div className="font-medium">{warranty.homeowner.address}</div>
                </div>
              )}
            </div>
          </section>

          {/* Job Info */}
          {warranty.job && (
            <section className="border rounded-lg bg-white p-4 shadow-sm">
              <h2 className="font-semibold text-lg mb-4">Job Details</h2>
              <div className="space-y-2 text-sm">
                <div>
                  <div className="text-gray-500">Stage</div>
                  <div className="font-medium">{warranty.job.stage}</div>
                </div>
                {warranty.job.contract_value && (
                  <div>
                    <div className="text-gray-500">Contract Value</div>
                    <div className="font-medium">
                      ${warranty.job.contract_value.toLocaleString()}
                    </div>
                  </div>
                )}
                <Link
                  href={`/dashboard/jobs/${warranty.job.id}`}
                  className="text-blue-600 hover:underline text-sm"
                >
                  View Job →
                </Link>
              </div>
            </section>
          )}

          {/* Warranty Info */}
          <section className="border rounded-lg bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-lg mb-4">Warranty Info</h2>
            <div className="space-y-2 text-sm">
              <div>
                <div className="text-gray-500">Type</div>
                <div className="font-medium">{warranty.warranty_type}</div>
              </div>
              <div>
                <div className="text-gray-500">Inspection Frequency</div>
                <div className="font-medium">
                  Every {warranty.inspection_frequency} days
                </div>
              </div>
              {warranty.notes && (
                <div>
                  <div className="text-gray-500">Notes</div>
                  <div className="font-medium">{warranty.notes}</div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

































