"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/Input";

interface PaymentScheduleBuilderProps {
  contractId: string;
  totalAmount: number;
  onScheduleCreated?: (scheduleId: string) => void;
}

export function PaymentScheduleBuilder({
  contractId,
  totalAmount,
  onScheduleCreated,
}: PaymentScheduleBuilderProps) {
  const [structure, setStructure] = useState<string[]>(["30", "40", "30"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddMilestone = () => {
    setStructure([...structure, "0"]);
  };

  const handleRemoveMilestone = (index: number) => {
    if (structure.length > 1) {
      const newStructure = structure.filter((_, i) => i !== index);
      setStructure(newStructure);
    }
  };

  const handlePercentageChange = (index: number, value: string) => {
    const newStructure = [...structure];
    newStructure[index] = value;
    setStructure(newStructure);
  };

  const calculateAmounts = () => {
    return structure.map((pct) => {
      const percentage = parseFloat(pct) || 0;
      return {
        percentage,
        amount: (totalAmount * percentage) / 100,
      };
    });
  };

  const totalPercentage = structure.reduce(
    (sum, pct) => sum + (parseFloat(pct) || 0),
    0
  );

  const handleCreateSchedule = async () => {
    if (Math.abs(totalPercentage - 100) > 0.01) {
      setError("Percentages must sum to 100%");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/payments/schedule/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contract_id: contractId,
          total_amount: totalAmount,
          structure: structure,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create payment schedule");
      }

      const data = await response.json();
      if (onScheduleCreated) {
        onScheduleCreated(data.schedule_id);
      }
    } catch (err: any) {
      setError(err.message || "Failed to create payment schedule");
    } finally {
      setLoading(false);
    }
  };

  const amounts = calculateAmounts();
  const labels = [
    "Deposit",
    ...Array.from({ length: structure.length - 2 }, (_, i) => `Progress Payment #${i + 1}`),
    "Final Payment",
  ];

  return (
    <div className="space-y-6 p-6 border rounded-lg bg-white">
      <div>
        <h3 className="text-lg font-semibold mb-2">Payment Schedule Builder</h3>
        <p className="text-sm text-gray-600 mb-4">
          Total Contract Amount: <span className="font-bold">${totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-medium">Suggested Schedule:</h4>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddMilestone}
            disabled={structure.length >= 10}
          >
            + Add Milestone
          </Button>
        </div>

        {structure.map((percentage, index) => {
          const amount = amounts[index];
          const label = labels[index] || `Payment #${index + 1}`;

          return (
            <div
              key={index}
              className="flex items-center gap-4 p-4 border rounded-lg bg-gray-50"
            >
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">{label}</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={percentage}
                    onChange={(e) => handlePercentageChange(index, e.target.value)}
                    className="w-24"
                    min="0"
                    max="100"
                    step="0.01"
                  />
                  <span className="text-sm text-gray-600">%</span>
                  <span className="text-sm font-semibold text-gray-800">
                    = ${amount.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              {structure.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveMilestone(index)}
                  className="text-red-600 hover:text-red-700"
                >
                  Remove
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
        <span className="font-medium">
          Total: {totalPercentage.toFixed(2)}%
        </span>
        {Math.abs(totalPercentage - 100) > 0.01 && (
          <span className="text-sm text-red-600">
            Must equal 100%
          </span>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <Button
          onClick={handleCreateSchedule}
          disabled={loading || Math.abs(totalPercentage - 100) > 0.01}
          className="flex-1"
        >
          {loading ? "Creating..." : "Save Schedule"}
        </Button>
        <Button
          variant="outline"
          onClick={() => setStructure(["30", "40", "30"])}
        >
          Reset to Default
        </Button>
      </div>
    </div>
  );
}

























