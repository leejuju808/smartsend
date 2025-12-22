"use client";

// Block 22420 — SmartSend Roofing Insurance Claim Tracker v1
// Insurance Dashboard UI

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, DollarSign, Clock, CheckCircle, XCircle, Phone, Mail } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface InsuranceClaim {
  id: string;
  job_id: string;
  carrier_name: string | null;
  claim_number: string | null;
  adjuster_name: string | null;
  adjuster_email: string | null;
  adjuster_phone: string | null;
  deductible: number;
  acv_amount: number;
  rcv_amount: number;
  depreciation_amount: number;
  acv_paid: number;
  rcv_paid: number;
  supplement_requested: number;
  supplement_approved: number;
  supplement_denied: number;
  claim_status: string;
  notes: string | null;
  job: {
    id: string;
    title: string | null;
    status: string | null;
    job_value: number | null;
    scheduled_start_date: string | null;
    scheduled_end_date: string | null;
  } | null;
}

interface InsuranceDashboardData {
  awaiting_acv: InsuranceClaim[];
  awaiting_rcv: InsuranceClaim[];
  awaiting_supplement: InsuranceClaim[];
  missing_depreciation: InsuranceClaim[];
  unpaid_deductible: InsuranceClaim[];
  total_claims: number;
}

export default function InsuranceDashboard() {
  const [data, setData] = useState<InsuranceDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchInsuranceData() {
      try {
        setLoading(true);
        const response = await fetch("/api/dashboard/insurance");
        if (!response.ok) {
          throw new Error("Failed to load insurance data");
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

    fetchInsuranceData();
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-gray-500 dark:text-zinc-400">
          Loading insurance dashboard…
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

  const {
    awaiting_acv,
    awaiting_rcv,
    awaiting_supplement,
    missing_depreciation,
    unpaid_deductible,
    total_claims,
  } = data;

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      complete: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      awaiting_acv: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      awaiting_rcv: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      awaiting_supplement: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      denied: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    };
    return (
      <span
        className={`text-[10px] px-1.5 py-0.5 rounded ${
          colors[status] || "bg-gray-100 text-gray-800"
        }`}
      >
        {status.replace("_", " ")}
      </span>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-50">
            Insurance Claim Dashboard
          </h1>
          <p className="text-xs text-gray-500 dark:text-zinc-400">
            Track ACV payments, RCV final checks, supplements, and carrier communication.
          </p>
        </div>
        <div className="text-xs text-gray-500 dark:text-zinc-400">
          Total Claims: <span className="font-semibold text-zinc-50">{total_claims}</span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Awaiting ACV */}
        <section className="border rounded-lg bg-white dark:bg-zinc-950 p-4 shadow-sm border-zinc-800 text-xs lg:col-span-1">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
            <h2 className="font-semibold text-sm text-zinc-50">
              Awaiting ACV Payment
            </h2>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-zinc-400 mb-3">
            Claims waiting for Actual Cash Value payment from insurance carrier.
          </p>
          <div className="max-h-96 overflow-y-auto space-y-2">
            {awaiting_acv.length === 0 && (
              <p className="text-gray-500 dark:text-zinc-500 text-xs">
                No claims awaiting ACV payment.
              </p>
            )}
            {awaiting_acv.map((claim) => (
              <Link
                key={claim.id}
                href={`/jobs/${claim.job_id}`}
                className="block border rounded p-2 bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900 hover:bg-yellow-100 dark:hover:bg-yellow-950/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate text-zinc-900 dark:text-zinc-50">
                      {claim.job?.title || "Roof Job"}
                    </p>
                    <p className="text-[11px] text-gray-600 dark:text-zinc-400 mt-1">
                      {claim.carrier_name || "Carrier"} • Claim #{claim.claim_number || "—"}
                    </p>
                    <p className="text-[11px] text-yellow-700 dark:text-yellow-400 mt-1 font-semibold">
                      ACV Owed: {formatCurrency(claim.acv_amount)} • Paid: {formatCurrency(claim.acv_paid)}
                    </p>
                    <p className="text-[11px] text-gray-600 dark:text-zinc-400 mt-1">
                      Remaining: {formatCurrency(claim.acv_amount - claim.acv_paid)}
                    </p>
                  </div>
                  {getStatusBadge(claim.claim_status)}
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Awaiting RCV */}
        <section className="border rounded-lg bg-white dark:bg-zinc-950 p-4 shadow-sm border-zinc-800 text-xs lg:col-span-1">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />
            <h2 className="font-semibold text-sm text-zinc-50">
              Awaiting RCV Final Payment
            </h2>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-zinc-400 mb-3">
            Claims waiting for Replacement Cost Value final payment.
          </p>
          <div className="max-h-96 overflow-y-auto space-y-2">
            {awaiting_rcv.length === 0 && (
              <p className="text-gray-500 dark:text-zinc-500 text-xs">
                No claims awaiting RCV payment.
              </p>
            )}
            {awaiting_rcv.map((claim) => (
              <Link
                key={claim.id}
                href={`/jobs/${claim.job_id}`}
                className="block border rounded p-2 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900 hover:bg-green-100 dark:hover:bg-green-950/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate text-zinc-900 dark:text-zinc-50">
                      {claim.job?.title || "Roof Job"}
                    </p>
                    <p className="text-[11px] text-gray-600 dark:text-zinc-400 mt-1">
                      {claim.carrier_name || "Carrier"} • Claim #{claim.claim_number || "—"}
                    </p>
                    <p className="text-[11px] text-green-700 dark:text-green-400 mt-1 font-semibold">
                      RCV Owed: {formatCurrency(claim.rcv_amount)} • Paid: {formatCurrency(claim.rcv_paid)}
                    </p>
                    <p className="text-[11px] text-gray-600 dark:text-zinc-400 mt-1">
                      Remaining: {formatCurrency(claim.rcv_amount - claim.rcv_paid)}
                    </p>
                  </div>
                  {getStatusBadge(claim.claim_status)}
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Awaiting Supplement */}
        <section className="border rounded-lg bg-white dark:bg-zinc-950 p-4 shadow-sm border-zinc-800 text-xs lg:col-span-1">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            <h2 className="font-semibold text-sm text-zinc-50">
              Awaiting Supplement Approval
            </h2>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-zinc-400 mb-3">
            Supplements that have been requested but not yet approved.
          </p>
          <div className="max-h-96 overflow-y-auto space-y-2">
            {awaiting_supplement.length === 0 && (
              <p className="text-gray-500 dark:text-zinc-500 text-xs">
                No supplements awaiting approval.
              </p>
            )}
            {awaiting_supplement.map((claim) => (
              <Link
                key={claim.id}
                href={`/jobs/${claim.job_id}`}
                className="block border rounded p-2 bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900 hover:bg-orange-100 dark:hover:bg-orange-950/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate text-zinc-900 dark:text-zinc-50">
                      {claim.job?.title || "Roof Job"}
                    </p>
                    <p className="text-[11px] text-gray-600 dark:text-zinc-400 mt-1">
                      {claim.carrier_name || "Carrier"} • Claim #{claim.claim_number || "—"}
                    </p>
                    <p className="text-[11px] text-orange-700 dark:text-orange-400 mt-1 font-semibold">
                      Supplement Requested: {formatCurrency(claim.supplement_requested)}
                    </p>
                    {claim.adjuster_name && (
                      <p className="text-[11px] text-gray-600 dark:text-zinc-400 mt-1">
                        Adjuster: {claim.adjuster_name}
                      </p>
                    )}
                  </div>
                  {getStatusBadge(claim.claim_status)}
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Missing Depreciation Recovery */}
        <section className="border rounded-lg bg-white dark:bg-zinc-950 p-4 shadow-sm border-zinc-800 text-xs lg:col-span-1">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
            <h2 className="font-semibold text-sm text-zinc-50">
              Missing Depreciation Recovery
            </h2>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-zinc-400 mb-3">
            Claims where depreciation hasn't been recovered after RCV payment.
          </p>
          <div className="max-h-96 overflow-y-auto space-y-2">
            {missing_depreciation.length === 0 && (
              <p className="text-gray-500 dark:text-zinc-500 text-xs">
                No claims missing depreciation recovery.
              </p>
            )}
            {missing_depreciation.map((claim) => (
              <Link
                key={claim.id}
                href={`/jobs/${claim.job_id}`}
                className="block border rounded p-2 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900 hover:bg-red-100 dark:hover:bg-red-950/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate text-zinc-900 dark:text-zinc-50">
                      {claim.job?.title || "Roof Job"}
                    </p>
                    <p className="text-[11px] text-gray-600 dark:text-zinc-400 mt-1">
                      {claim.carrier_name || "Carrier"} • Claim #{claim.claim_number || "—"}
                    </p>
                    <p className="text-[11px] text-red-700 dark:text-red-400 mt-1 font-semibold">
                      Depreciation: {formatCurrency(claim.depreciation_amount)}
                    </p>
                    <p className="text-[11px] text-gray-600 dark:text-zinc-400 mt-1">
                      RCV Paid: {formatCurrency(claim.rcv_paid)} • ACV Paid: {formatCurrency(claim.acv_paid)}
                    </p>
                  </div>
                  {getStatusBadge(claim.claim_status)}
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Unpaid Deductible */}
        <section className="border rounded-lg bg-white dark:bg-zinc-950 p-4 shadow-sm border-zinc-800 text-xs lg:col-span-2">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <h2 className="font-semibold text-sm text-zinc-50">
              Homeowner Deductible Unpaid
            </h2>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-zinc-400 mb-3">
            Claims where homeowner still owes deductible amount.
          </p>
          <div className="max-h-96 overflow-y-auto space-y-2">
            {unpaid_deductible.length === 0 && (
              <p className="text-gray-500 dark:text-zinc-500 text-xs">
                No unpaid deductibles.
              </p>
            )}
            {unpaid_deductible.map((claim) => (
              <Link
                key={claim.id}
                href={`/jobs/${claim.job_id}`}
                className="block border rounded p-2 bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-900 hover:bg-purple-100 dark:hover:bg-purple-950/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate text-zinc-900 dark:text-zinc-50">
                      {claim.job?.title || "Roof Job"}
                    </p>
                    <p className="text-[11px] text-gray-600 dark:text-zinc-400 mt-1">
                      {claim.carrier_name || "Carrier"} • Claim #{claim.claim_number || "—"}
                    </p>
                    <p className="text-[11px] text-purple-700 dark:text-purple-400 mt-1 font-semibold">
                      Deductible: {formatCurrency(claim.deductible)}
                    </p>
                    {claim.adjuster_name && (
                      <p className="text-[11px] text-gray-600 dark:text-zinc-400 mt-1">
                        Adjuster: {claim.adjuster_name}
                        {claim.adjuster_phone && ` • ${claim.adjuster_phone}`}
                      </p>
                    )}
                  </div>
                  {getStatusBadge(claim.claim_status)}
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}








































