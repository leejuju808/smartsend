"use client";

// Block 22350 — SmartSend Roofing Job Closeout Package v1
// Public Homeowner Closeout Page
// Displays professional completion report for homeowners

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface CloseoutData {
  job: any;
  lead: any;
  before: any[];
  after: any[];
  contract: any;
  invoices: any[];
  materials: any[];
  payments: any[];
  permits: any[];
  crewNotes: string | null;
  homeownerNotes: string | null;
  crewAssignments: any[];
}

export default function CloseoutPage() {
  const params = useParams();
  const token = params?.token as string;

  const { data, error, isLoading } = useSWR<CloseoutData>(
    token ? `/api/public-closeout/${token}` : null,
    fetcher
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Closeout Package…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Closeout Package Not Found
          </h1>
          <p className="text-gray-600">
            {error?.message || "This closeout link is invalid or has expired."}
          </p>
        </div>
      </div>
    );
  }

  const {
    job,
    lead,
    before,
    after,
    contract,
    invoices,
    materials,
    payments,
    permits,
    crewNotes,
    homeownerNotes,
  } = data;

  const totalPaid = job.revenue_collected || 0;
  const contractValue = Number(job.job_value || 0);
  const balanceRemaining = Math.max(contractValue - totalPaid, 0);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold text-gray-900">
              Roofing Project Completion Report
            </h1>
            {lead && (
              <p className="text-sm text-gray-600">
                {lead.first_name} {lead.last_name}
                {lead.address && ` — ${lead.address}`}
                {lead.city && lead.state && `, ${lead.city}, ${lead.state}`}
              </p>
            )}
            {job.title && (
              <p className="text-xs text-gray-500 mt-1">{job.title}</p>
            )}
          </div>
        </header>

        {/* Before & After Photos */}
        {(before.length > 0 || after.length > 0) && (
          <section className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h2 className="font-semibold text-lg mb-4 text-gray-900">
              Before & After Photos
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-medium mb-3 text-gray-700">Before</h3>
                <div className="grid grid-cols-1 gap-3">
                  {before.length === 0 ? (
                    <p className="text-xs text-gray-500">No before photos available.</p>
                  ) : (
                    before.map((p: any) =>
                      p.file_url ? (
                        <img
                          key={p.id}
                          src={p.file_url}
                          alt="Before"
                          className="rounded-lg shadow-md w-full object-cover"
                        />
                      ) : null
                    )
                  )}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium mb-3 text-gray-700">After</h3>
                <div className="grid grid-cols-1 gap-3">
                  {after.length === 0 ? (
                    <p className="text-xs text-gray-500">No after photos available.</p>
                  ) : (
                    after.map((p: any) =>
                      p.file_url ? (
                        <img
                          key={p.id}
                          src={p.file_url}
                          alt="After"
                          className="rounded-lg shadow-md w-full object-cover"
                        />
                      ) : null
                    )
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Materials Used */}
        {materials && materials.length > 0 && (
          <section className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h2 className="font-semibold text-lg mb-4 text-gray-900">
              Materials Used
            </h2>
            <div className="space-y-4">
              {materials.map((m: any) => (
                <div
                  key={m.id}
                  className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                >
                  <p className="font-semibold text-sm mb-2 text-gray-900">
                    {m.status || "Order"}
                    {m.actual_delivery_date && (
                      <span className="text-xs font-normal text-gray-500 ml-2">
                        — Delivered: {new Date(m.actual_delivery_date).toLocaleDateString()}
                      </span>
                    )}
                  </p>
                  {m.items && m.items.length > 0 ? (
                    <ul className="space-y-1 text-sm text-gray-700">
                      {m.items.map((it: any, idx: number) => (
                        <li key={idx}>
                          {it.quantity} {it.unit || "unit"} — {it.description}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-gray-500">No items recorded.</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Payment Summary */}
        <section className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="font-semibold text-lg mb-4 text-gray-900">
            Payment Summary
          </h2>
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-700">Contract Value:</span>
              <span className="font-semibold text-gray-900">
                ${contractValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-700">Total Paid:</span>
              <span className="font-semibold text-green-700">
                ${totalPaid.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            {balanceRemaining > 0 && (
              <div className="flex justify-between items-center pt-2 border-t border-gray-300">
                <span className="text-sm font-medium text-gray-900">
                  Balance Remaining:
                </span>
                <span className="font-semibold text-gray-900">
                  ${balanceRemaining.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
            {balanceRemaining === 0 && (
              <div className="pt-2 border-t border-gray-300">
                <p className="text-sm font-medium text-green-700">
                  ✓ Payment Complete
                </p>
              </div>
            )}

            {payments && payments.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-300">
                <h3 className="font-semibold text-sm mb-2 text-gray-900">
                  Payment History
                </h3>
                <div className="space-y-2">
                  {payments
                    .filter((p: any) => p.status === "received")
                    .map((p: any) => (
                      <div
                        key={p.id}
                        className="flex justify-between items-center text-sm"
                      >
                        <span className="text-gray-700">
                          {new Date(p.received_at).toLocaleDateString()} —{" "}
                          {p.payment_type || "Payment"}
                        </span>
                        <span className="font-medium text-gray-900">
                          ${Number(p.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Invoices */}
        {invoices && invoices.length > 0 && (
          <section className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h2 className="font-semibold text-lg mb-4 text-gray-900">
              Invoices
            </h2>
            <div className="space-y-2">
              {invoices.map((inv: any) => (
                <div key={inv.id} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">
                    {inv.title || "Invoice"}
                  </span>
                  {inv.file_url ? (
                    <a
                      href={inv.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 underline text-sm font-medium"
                    >
                      View Invoice →
                    </a>
                  ) : (
                    <span className="text-xs text-gray-500">Not available</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Contract */}
        {contract && (
          <section className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h2 className="font-semibold text-lg mb-4 text-gray-900">
              Contract
            </h2>
            {contract.file_url ? (
              <a
                href={contract.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline text-sm font-medium"
              >
                View Contract Document →
              </a>
            ) : (
              <p className="text-xs text-gray-500">Contract not available.</p>
            )}
          </section>
        )}

        {/* Permits */}
        {permits && permits.length > 0 && (
          <section className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h2 className="font-semibold text-lg mb-4 text-gray-900">
              Permits
            </h2>
            <div className="space-y-2">
              {permits.map((p: any) => (
                <div key={p.id}>
                  {p.file_url ? (
                    <a
                      href={p.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 underline text-sm font-medium"
                    >
                      {p.title || "View Permit Document"} →
                    </a>
                  ) : (
                    <span className="text-xs text-gray-500">
                      {p.title || "Permit"} — Not available
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Crew Notes */}
        {crewNotes && (
          <section className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h2 className="font-semibold text-lg mb-3 text-gray-900">
              Crew Notes
            </h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {crewNotes}
            </p>
          </section>
        )}

        {/* Homeowner Notes */}
        {homeownerNotes && (
          <section className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h2 className="font-semibold text-lg mb-3 text-gray-900">
              Homeowner Notes
            </h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {homeownerNotes}
            </p>
          </section>
        )}

        {/* Footer */}
        <footer className="text-center text-xs text-gray-500 mt-8 mb-4">
          <p>Powered by SmartSend — Professional roofing project management</p>
        </footer>
      </div>
    </div>
  );
}








































