// Block 33155 — SmartSend Roofing "Smart Financing Engine + Homeowner Offer Flow" v1
// Component: FinancingStatus
// Displays financing status for a lead or job

"use client";

import { useState, useEffect } from "react";
import { CreditCard, CheckCircle2, XCircle, Clock, FileText } from "lucide-react";

interface FinancingStatusProps {
  leadId?: string;
  jobId?: string;
  className?: string;
}

interface FinancingStatusData {
  has_application: boolean;
  latest_application?: {
    id: string;
    status: string;
    amount_requested: number;
    monthly_payment_estimate?: number;
    term_months?: number;
    approved_at?: string;
    created_at: string;
  };
  click_count?: number;
  is_financed?: boolean;
}

export function FinancingStatus({
  leadId,
  jobId,
  className = "",
}: FinancingStatusProps) {
  const [status, setStatus] = useState<FinancingStatusData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      if (!leadId && !jobId) {
        setLoading(false);
        return;
      }

      try {
        const type = leadId ? "lead" : "job";
        const id = leadId || jobId;
        const response = await fetch(`/api/financing/status/${id}?type=${type}`);

        if (!response.ok) {
          throw new Error("Failed to fetch financing status");
        }

        const data = await response.json();
        setStatus(data);
      } catch (error) {
        console.error("Error fetching financing status:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, [leadId, jobId]);

  if (loading) {
    return (
      <div className={`bg-white rounded-lg border p-4 ${className}`}>
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-500">Loading financing status...</span>
        </div>
      </div>
    );
  }

  if (!status || !status.has_application) {
    return (
      <div className={`bg-white rounded-lg border p-4 ${className}`}>
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-500">No financing application</span>
        </div>
      </div>
    );
  }

  const app = status.latest_application;
  if (!app) return null;

  const getStatusIcon = () => {
    switch (app.status) {
      case "approved":
      case "preapproved":
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case "declined":
        return <XCircle className="w-5 h-5 text-red-600" />;
      case "needs_docs":
      case "submitted":
        return <FileText className="w-5 h-5 text-yellow-600" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusText = () => {
    switch (app.status) {
      case "approved":
        return "Approved";
      case "preapproved":
        return "Pre-Approved";
      case "declined":
        return "Declined";
      case "needs_docs":
        return "Needs Documents";
      case "submitted":
        return "Under Review";
      default:
        return "In Progress";
    }
  };

  const getStatusColor = () => {
    switch (app.status) {
      case "approved":
      case "preapproved":
        return "text-green-600 bg-green-50";
      case "declined":
        return "text-red-600 bg-red-50";
      case "needs_docs":
      case "submitted":
        return "text-yellow-600 bg-yellow-50";
      default:
        return "text-gray-600 bg-gray-50";
    }
  };

  return (
    <div className={`bg-white rounded-lg border p-4 ${className}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-blue-600" />
          <h4 className="font-semibold text-sm">Financing Status</h4>
        </div>
        <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${getStatusColor()}`}>
          {getStatusIcon()}
          <span>{getStatusText()}</span>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Amount:</span>
          <span className="font-semibold">${app.amount_requested?.toLocaleString()}</span>
        </div>

        {app.monthly_payment_estimate && (
          <div className="flex justify-between">
            <span className="text-gray-600">Monthly Payment:</span>
            <span className="font-semibold">${app.monthly_payment_estimate.toLocaleString()}</span>
          </div>
        )}

        {app.term_months && (
          <div className="flex justify-between">
            <span className="text-gray-600">Term:</span>
            <span className="font-semibold">{app.term_months} months</span>
          </div>
        )}

        {app.approved_at && (
          <div className="flex justify-between">
            <span className="text-gray-600">Approved:</span>
            <span className="text-gray-900">
              {new Date(app.approved_at).toLocaleDateString()}
            </span>
          </div>
        )}
      </div>

      {status.is_financed && (
        <div className="mt-3 pt-3 border-t">
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
            <CheckCircle2 className="w-3 h-3" />
            Job is Financed
          </span>
        </div>
      )}
    </div>
  );
}

































