// Block 33155 — SmartSend Roofing "Smart Financing Engine + Homeowner Offer Flow" v1
// Component: FinancingCalculator
// Shows monthly payment estimates for different terms

"use client";

import { useState, useEffect } from "react";
import { Calculator, Loader2 } from "lucide-react";

interface FinancingCalculatorProps {
  amount: number;
  apr?: number;
  onSelectTerm?: (months: number, payment: number) => void;
  className?: string;
}

interface PaymentEstimate {
  months: number;
  payment: number;
  apr: number;
  total_amount: number;
}

export function FinancingCalculator({
  amount,
  apr,
  onSelectTerm,
  className = "",
}: FinancingCalculatorProps) {
  const [estimates, setEstimates] = useState<PaymentEstimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTerm, setSelectedTerm] = useState<number | null>(null);

  useEffect(() => {
    const fetchEstimates = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/financing/calculate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ amount, apr }),
        });

        if (!response.ok) {
          throw new Error("Failed to calculate payments");
        }

        const data = await response.json();
        setEstimates(data.estimates || []);
      } catch (err: any) {
        console.error("Error calculating payments:", err);
        setError(err.message || "Failed to calculate payments");
      } finally {
        setLoading(false);
      }
    };

    if (amount > 0) {
      fetchEstimates();
    }
  }, [amount, apr]);

  const handleSelectTerm = (months: number, payment: number) => {
    setSelectedTerm(months);
    if (onSelectTerm) {
      onSelectTerm(months, payment);
    }
  };

  if (loading) {
    return (
      <div className={`bg-white rounded-xl border shadow-sm p-6 ${className}`}>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-white rounded-xl border shadow-sm p-6 ${className}`}>
        <div className="text-center py-8">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl border shadow-sm p-6 ${className}`}>
      <div className="flex items-center gap-2 mb-4">
        <Calculator className="w-5 h-5 text-blue-600" />
        <h3 className="font-semibold text-lg">Monthly Payment Options</h3>
      </div>

      <div className="mb-4">
        <p className="text-sm text-gray-600">
          Roof Price: <span className="font-semibold">${amount.toLocaleString()}</span>
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {estimates.map((estimate) => (
          <button
            key={estimate.months}
            onClick={() => handleSelectTerm(estimate.months, estimate.payment)}
            className={`
              p-4 rounded-lg border-2 transition-all
              ${
                selectedTerm === estimate.months
                  ? "border-blue-600 bg-blue-50"
                  : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
              }
            `}
          >
            <div className="text-xs text-gray-500 mb-1">{estimate.months} Months</div>
            <div className="text-xl font-bold text-gray-900">
              ${estimate.payment.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500 mt-1">/month</div>
          </button>
        ))}
      </div>

      {estimates.length > 0 && (
        <div className="mt-4 pt-4 border-t text-xs text-gray-500">
          <p>
            Estimated APR: {(estimates[0].apr * 100).toFixed(1)}% • 
            Subject to credit approval
          </p>
        </div>
      )}
    </div>
  );
}

































