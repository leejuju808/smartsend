// Block 22420 — SmartSend Roofing Insurance Claim Tracker v1
// Component: JobInsurancePanel
// Displays insurance claim information for a job

"use client";

import useSWR from "swr";
import { AlertTriangle, CheckCircle, Clock, DollarSign, FileText, Phone, Mail, User } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function JobInsurancePanel({ jobId }: { jobId: string }) {
  const { data, error, mutate } = useSWR(
    `/api/jobs/${jobId}/insurance`,
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
        Error loading insurance claim information.
      </div>
    );
  }

  const { claim, job } = data;

  if (!claim) {
    return (
      <div className="border rounded-lg p-4 bg-white dark:bg-zinc-950 border-zinc-800 text-xs text-gray-600 dark:text-zinc-400">
        <h3 className="font-semibold text-sm mb-2 text-zinc-50">Insurance Claim</h3>
        <p>No insurance claim recorded for this job.</p>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "complete":
        return "text-green-600 dark:text-green-400";
      case "in_progress":
        return "text-blue-600 dark:text-blue-400";
      case "awaiting_acv":
      case "awaiting_rcv":
      case "awaiting_supplement":
        return "text-yellow-600 dark:text-yellow-400";
      case "denied":
        return "text-red-600 dark:text-red-400";
      default:
        return "text-gray-600 dark:text-gray-400";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "complete":
        return <CheckCircle className="w-4 h-4" />;
      case "in_progress":
      case "awaiting_acv":
      case "awaiting_rcv":
      case "awaiting_supplement":
        return <Clock className="w-4 h-4" />;
      case "denied":
        return <AlertTriangle className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const remainingBalance = job?.insurance_balance_remaining || 0;
  const acvRemaining = Math.max(0, (claim.acv_amount || 0) - (claim.acv_paid || 0));
  const rcvRemaining = Math.max(0, (claim.rcv_amount || 0) - (claim.rcv_paid || 0));

  return (
    <div className="space-y-4">
      {/* Claim Summary */}
      <div className="border rounded-lg bg-white dark:bg-zinc-950 p-4 shadow-sm border-zinc-800 text-xs">
        <h3 className="font-semibold text-sm mb-2 text-zinc-50 flex items-center gap-2">
          <DollarSign className="w-4 h-4" />
          Insurance Claim Summary
        </h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Carrier:</span>
            <span className="font-semibold text-zinc-50">
              {claim.carrier_name || "—"}
            </span>
          </div>
          {claim.claim_number && (
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Claim #:</span>
              <span className="font-semibold text-zinc-50">
                {claim.claim_number}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Status:</span>
            <span
              className={`font-semibold flex items-center gap-1 ${getStatusColor(
                claim.claim_status || "not_started"
              )}`}
            >
              {getStatusIcon(claim.claim_status || "not_started")}
              {claim.claim_status?.replace("_", " ") || "not started"}
            </span>
          </div>
          <div className="mt-2 pt-2 border-t border-zinc-800">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Remaining Balance:</span>
              <span className={`font-bold text-lg ${
                remainingBalance > 0 
                  ? "text-yellow-400" 
                  : remainingBalance < 0 
                  ? "text-red-400" 
                  : "text-green-400"
              }`}>
                {formatCurrency(remainingBalance)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Breakdown */}
      <div className="border rounded-lg bg-white dark:bg-zinc-950 p-4 shadow-sm border-zinc-800 text-xs">
        <h3 className="font-semibold text-sm mb-2 text-zinc-50 flex items-center gap-2">
          <DollarSign className="w-4 h-4" />
          Payment Breakdown
        </h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Deductible:</span>
            <span className="font-semibold text-zinc-50">
              {formatCurrency(claim.deductible || 0)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">ACV Owed:</span>
            <span className="font-semibold text-zinc-50">
              {formatCurrency(claim.acv_amount || 0)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">ACV Paid:</span>
            <span className={`font-semibold ${
              claim.acv_paid >= claim.acv_amount 
                ? "text-green-400" 
                : "text-yellow-400"
            }`}>
              {formatCurrency(claim.acv_paid || 0)}
              {acvRemaining > 0 && (
                <span className="text-xs ml-1">({formatCurrency(acvRemaining)} remaining)</span>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">RCV Owed:</span>
            <span className="font-semibold text-zinc-50">
              {formatCurrency(claim.rcv_amount || 0)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">RCV Paid:</span>
            <span className={`font-semibold ${
              claim.rcv_paid >= claim.rcv_amount 
                ? "text-green-400" 
                : "text-yellow-400"
            }`}>
              {formatCurrency(claim.rcv_paid || 0)}
              {rcvRemaining > 0 && (
                <span className="text-xs ml-1">({formatCurrency(rcvRemaining)} remaining)</span>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Depreciation:</span>
            <span className="font-semibold text-zinc-50">
              {formatCurrency(claim.depreciation_amount || 0)}
            </span>
          </div>
        </div>
      </div>

      {/* Supplements */}
      {(claim.supplement_requested > 0 || claim.supplement_approved > 0 || claim.supplement_denied > 0) && (
        <div className="border rounded-lg bg-white dark:bg-zinc-950 p-4 shadow-sm border-zinc-800 text-xs">
          <h3 className="font-semibold text-sm mb-2 text-zinc-50 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Supplements
          </h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Requested:</span>
              <span className="font-semibold text-zinc-50">
                {formatCurrency(claim.supplement_requested || 0)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Approved:</span>
              <span className="font-semibold text-green-400">
                {formatCurrency(claim.supplement_approved || 0)}
              </span>
            </div>
            {claim.supplement_denied > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Denied:</span>
                <span className="font-semibold text-red-400">
                  {formatCurrency(claim.supplement_denied || 0)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Adjuster Contact */}
      {(claim.adjuster_name || claim.adjuster_email || claim.adjuster_phone) && (
        <div className="border rounded-lg bg-white dark:bg-zinc-950 p-4 shadow-sm border-zinc-800 text-xs">
          <h3 className="font-semibold text-sm mb-2 text-zinc-50 flex items-center gap-2">
            <User className="w-4 h-4" />
            Adjuster Contact
          </h3>
          <div className="space-y-2">
            {claim.adjuster_name && (
              <div className="flex items-center gap-2">
                <User className="w-3 h-3 text-zinc-400" />
                <span className="text-zinc-50">{claim.adjuster_name}</span>
              </div>
            )}
            {claim.adjuster_phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-3 h-3 text-zinc-400" />
                <a
                  href={`tel:${claim.adjuster_phone}`}
                  className="text-blue-400 hover:underline"
                >
                  {claim.adjuster_phone}
                </a>
              </div>
            )}
            {claim.adjuster_email && (
              <div className="flex items-center gap-2">
                <Mail className="w-3 h-3 text-zinc-400" />
                <a
                  href={`mailto:${claim.adjuster_email}`}
                  className="text-blue-400 hover:underline"
                >
                  {claim.adjuster_email}
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Notes */}
      {claim.notes && (
        <div className="border rounded-lg bg-white dark:bg-zinc-950 p-4 shadow-sm border-zinc-800 text-xs">
          <h3 className="font-semibold text-sm mb-2 text-zinc-50 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Notes
          </h3>
          <p className="text-zinc-300 whitespace-pre-wrap">{claim.notes}</p>
        </div>
      )}
    </div>
  );
}








































