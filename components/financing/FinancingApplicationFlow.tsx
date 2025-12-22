// Block 33155 — SmartSend Roofing "Smart Financing Engine + Homeowner Offer Flow" v1
// Component: FinancingApplicationFlow
// Handles financing application form and submission

"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

interface FinancingApplicationFlowProps {
  amount: number;
  leadId?: string;
  jobId?: string;
  proposalId?: string;
  workspaceId?: string;
  financingProvider?: string;
  onComplete?: (applicationId: string) => void;
  onCancel?: () => void;
  className?: string;
}

export function FinancingApplicationFlow({
  amount,
  leadId,
  jobId,
  proposalId,
  workspaceId,
  financingProvider = "wisetack",
  onComplete,
  onCancel,
  className = "",
}: FinancingApplicationFlowProps) {
  const [step, setStep] = useState<"form" | "submitting" | "success" | "error">("form");
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    ssn_last4: "",
    income_range: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [applicationId, setApplicationId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStep("submitting");
    setError(null);

    try {
      // Create application
      const response = await fetch("/api/financing/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lead_id: leadId,
          job_id: jobId,
          proposal_id: proposalId,
          workspace_id: workspaceId,
          amount_requested: amount,
          financing_provider: financingProvider,
          application_data: {
            name: formData.name,
            address: formData.address,
            ssn_last4: formData.ssn_last4,
            income_range: formData.income_range,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to submit application");
      }

      const data = await response.json();
      setApplicationId(data.application?.id || null);
      setStep("success");

      if (onComplete && data.application?.id) {
        onComplete(data.application.id);
      }

      // Redirect to provider application if needed
      // This would typically be handled by the provider's API
      // For now, we just show success
    } catch (err: any) {
      console.error("Error submitting application:", err);
      setError(err.message || "Failed to submit application");
      setStep("error");
    }
  };

  if (step === "submitting") {
    return (
      <div className={`bg-white rounded-xl border shadow-sm p-6 ${className}`}>
        <div className="flex flex-col items-center justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-4" />
          <p className="text-sm text-gray-600">Submitting your application...</p>
        </div>
      </div>
    );
  }

  if (step === "success") {
    return (
      <div className={`bg-white rounded-xl border shadow-sm p-6 ${className}`}>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-600 mb-4" />
          <h3 className="font-semibold text-lg mb-2">Application Submitted!</h3>
          <p className="text-sm text-gray-600 mb-4">
            Your financing application has been received. We'll review it and get back to you shortly.
          </p>
          {onComplete && (
            <button
              onClick={() => onComplete(applicationId || "")}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Continue
            </button>
          )}
        </div>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className={`bg-white rounded-xl border shadow-sm p-6 ${className}`}>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <XCircle className="w-12 h-12 text-red-600 mb-4" />
          <h3 className="font-semibold text-lg mb-2">Application Failed</h3>
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <button
            onClick={() => {
              setStep("form");
              setError(null);
            }}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl border shadow-sm p-6 ${className}`}>
      <h3 className="font-semibold text-lg mb-4">Financing Application</h3>
      <p className="text-sm text-gray-600 mb-6">
        Complete this quick form to apply for financing on your ${amount.toLocaleString()} roof project.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1 font-medium">
            Full Name *
          </label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="John Doe"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1 font-medium">
            Address *
          </label>
          <input
            type="text"
            required
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="123 Main St, City, State ZIP"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1 font-medium">
            Last 4 Digits of SSN *
          </label>
          <input
            type="text"
            required
            maxLength={4}
            pattern="[0-9]{4}"
            value={formData.ssn_last4}
            onChange={(e) => setFormData({ ...formData, ssn_last4: e.target.value.replace(/\D/g, "") })}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="1234"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1 font-medium">
            Annual Income Range *
          </label>
          <select
            required
            value={formData.income_range}
            onChange={(e) => setFormData({ ...formData, income_range: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select income range</option>
            <option value="under_30k">Under $30,000</option>
            <option value="30k_50k">$30,000 - $50,000</option>
            <option value="50k_75k">$50,000 - $75,000</option>
            <option value="75k_100k">$75,000 - $100,000</option>
            <option value="100k_150k">$100,000 - $150,000</option>
            <option value="over_150k">Over $150,000</option>
          </select>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            className="flex-1 px-6 py-3 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Submit Application
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-3 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>

        <p className="text-xs text-gray-500 mt-4">
          By submitting, you agree to our terms and conditions. Approval subject to credit check.
        </p>
      </form>
    </div>
  );
}

































