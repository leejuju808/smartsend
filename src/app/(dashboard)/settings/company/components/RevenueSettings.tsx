"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

interface RevenueSettingsProps {
  canEdit: boolean;
}

export default function RevenueSettings({ canEdit }: RevenueSettingsProps) {
  const [repairRange, setRepairRange] = useState({ min: 5000, max: 15000 });
  const [replacementRange, setReplacementRange] = useState({ min: 15000, max: 35000 });
  const [insuranceRange, setInsuranceRange] = useState({ min: 20000, max: 50000 });
  const [neighborhoodPremium, setNeighborhoodPremium] = useState(0);
  const [urgencyMultiplier, setUrgencyMultiplier] = useState(1.0);
  const [confidenceThresholds, setConfidenceThresholds] = useState({
    low: 30,
    medium: 60,
    high: 80,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch("/api/company/settings");
      const data = await res.json();

      if (data.revenue) {
        if (data.revenue.default_repair_value_range) {
          setRepairRange(data.revenue.default_repair_value_range);
        }
        if (data.revenue.default_replacement_value_range) {
          setReplacementRange(data.revenue.default_replacement_value_range);
        }
        if (data.revenue.default_insurance_claim_range) {
          setInsuranceRange(data.revenue.default_insurance_claim_range);
        }
        setNeighborhoodPremium(data.revenue.neighborhood_premium_percent || 0);
        setUrgencyMultiplier(data.revenue.urgency_multiplier || 1.0);
        if (data.revenue.confidence_threshold_low) {
          setConfidenceThresholds({
            low: data.revenue.confidence_threshold_low,
            medium: data.revenue.confidence_threshold_medium,
            high: data.revenue.confidence_threshold_high,
          });
        }
      }
    } catch (error) {
      console.error("Failed to load revenue settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!canEdit) return;

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/company/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: "revenue",
          data: {
            default_repair_value_range: repairRange,
            default_replacement_value_range: replacementRange,
            default_insurance_claim_range: insuranceRange,
            neighborhood_premium_percent: neighborhoodPremium,
            urgency_multiplier: urgencyMultiplier,
            confidence_threshold_low: confidenceThresholds.low,
            confidence_threshold_medium: confidenceThresholds.medium,
            confidence_threshold_high: confidenceThresholds.high,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Save failed");
      }

      setMessage("Revenue settings saved!");
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-semibold mb-2">Revenue Settings</h1>
        <p className="text-muted-foreground mb-6">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Revenue Settings</h1>
        <p className="text-sm text-gray-600">
          Tune the revenue engine with default value ranges, premiums, and confidence thresholds
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        <div>
          <h3 className="text-sm font-medium text-gray-900 mb-4">Default Value Ranges</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Repair Value Range
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={repairRange.min}
                  onChange={(e) =>
                    setRepairRange({ ...repairRange, min: parseInt(e.target.value) || 0 })
                  }
                  disabled={!canEdit}
                  className="w-32"
                  placeholder="Min"
                />
                <span className="text-gray-500">to</span>
                <Input
                  type="number"
                  value={repairRange.max}
                  onChange={(e) =>
                    setRepairRange({ ...repairRange, max: parseInt(e.target.value) || 0 })
                  }
                  disabled={!canEdit}
                  className="w-32"
                  placeholder="Max"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Replacement Value Range
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={replacementRange.min}
                  onChange={(e) =>
                    setReplacementRange({ ...replacementRange, min: parseInt(e.target.value) || 0 })
                  }
                  disabled={!canEdit}
                  className="w-32"
                  placeholder="Min"
                />
                <span className="text-gray-500">to</span>
                <Input
                  type="number"
                  value={replacementRange.max}
                  onChange={(e) =>
                    setReplacementRange({ ...replacementRange, max: parseInt(e.target.value) || 0 })
                  }
                  disabled={!canEdit}
                  className="w-32"
                  placeholder="Max"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Insurance Claim Range
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={insuranceRange.min}
                  onChange={(e) =>
                    setInsuranceRange({ ...insuranceRange, min: parseInt(e.target.value) || 0 })
                  }
                  disabled={!canEdit}
                  className="w-32"
                  placeholder="Min"
                />
                <span className="text-gray-500">to</span>
                <Input
                  type="number"
                  value={insuranceRange.max}
                  onChange={(e) =>
                    setInsuranceRange({ ...insuranceRange, max: parseInt(e.target.value) || 0 })
                  }
                  disabled={!canEdit}
                  className="w-32"
                  placeholder="Max"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="border-t pt-6">
          <h3 className="text-sm font-medium text-gray-900 mb-4">Adjustments</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Neighborhood Premium (%)
              </label>
              <Input
                type="number"
                value={neighborhoodPremium}
                onChange={(e) => setNeighborhoodPremium(parseFloat(e.target.value) || 0)}
                disabled={!canEdit}
                className="w-full"
                step="0.1"
                min="-50"
                max="50"
              />
              <p className="mt-1 text-xs text-gray-500">
                Adjust value up or down based on neighborhood (+/- %)
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Urgency Multiplier
              </label>
              <Input
                type="number"
                value={urgencyMultiplier}
                onChange={(e) => setUrgencyMultiplier(parseFloat(e.target.value) || 1.0)}
                disabled={!canEdit}
                className="w-full"
                step="0.1"
                min="0.5"
                max="2.0"
              />
              <p className="mt-1 text-xs text-gray-500">
                Multiply value based on urgency level
              </p>
            </div>
          </div>
        </div>

        <div className="border-t pt-6">
          <h3 className="text-sm font-medium text-gray-900 mb-4">Confidence Thresholds</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Low (0-100)
              </label>
              <Input
                type="number"
                value={confidenceThresholds.low}
                onChange={(e) =>
                  setConfidenceThresholds({
                    ...confidenceThresholds,
                    low: parseInt(e.target.value) || 0,
                  })
                }
                disabled={!canEdit}
                className="w-full"
                min="0"
                max="100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Medium (0-100)
              </label>
              <Input
                type="number"
                value={confidenceThresholds.medium}
                onChange={(e) =>
                  setConfidenceThresholds({
                    ...confidenceThresholds,
                    medium: parseInt(e.target.value) || 0,
                  })
                }
                disabled={!canEdit}
                className="w-full"
                min="0"
                max="100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                High (0-100)
              </label>
              <Input
                type="number"
                value={confidenceThresholds.high}
                onChange={(e) =>
                  setConfidenceThresholds({
                    ...confidenceThresholds,
                    high: parseInt(e.target.value) || 0,
                  })
                }
                disabled={!canEdit}
                className="w-full"
                min="0"
                max="100"
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Confidence thresholds for revenue estimation accuracy
          </p>
        </div>

        {message && (
          <div
            className={`p-3 rounded-md ${
              message.startsWith("Error")
                ? "bg-red-50 text-red-800"
                : "bg-green-50 text-green-800"
            }`}
          >
            {message}
          </div>
        )}

        {canEdit && (
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}





















































