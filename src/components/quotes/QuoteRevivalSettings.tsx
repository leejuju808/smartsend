// Block 28844 — Quote Revival Settings Component
// Allows contractors to configure price drop rules

"use client";

import { useState, useEffect } from "react";

interface PriceDropRules {
  enable_discounts: boolean;
  discount_type: "percent" | "fixed" | null;
  discount_value: number;
  monthly_limit: number;
  used_this_month: number;
}

interface Props {
  workspaceId: string;
}

export default function QuoteRevivalSettings({ workspaceId }: Props) {
  const [rules, setRules] = useState<PriceDropRules>({
    enable_discounts: false,
    discount_type: null,
    discount_value: 0,
    monthly_limit: 5,
    used_this_month: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchRules();
  }, [workspaceId]);

  const fetchRules = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/quotes/revival/rules?workspace_id=${workspaceId}`);
      if (response.ok) {
        const data = await response.json();
        setRules(data);
      }
    } catch (error) {
      console.error("Error fetching price drop rules:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await fetch("/api/quotes/revival/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          ...rules,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setRules(data);
        alert("Settings saved successfully!");
      } else {
        alert("Error saving settings");
      }
    } catch (error) {
      console.error("Error saving price drop rules:", error);
      alert("Error saving settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="border rounded-2xl p-6 bg-white">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-2xl p-6 bg-white">
      <h2 className="text-xl font-semibold mb-4">Price Drop Settings</h2>
      <p className="text-sm text-gray-600 mb-6">
        Configure automatic price drop offers for stalled quotes. These discounts are limited per month to protect your margins.
      </p>

      <div className="space-y-4">
        {/* Enable Discounts */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="enable_discounts"
            checked={rules.enable_discounts}
            onChange={(e) => setRules({ ...rules, enable_discounts: e.target.checked })}
            className="w-4 h-4"
          />
          <label htmlFor="enable_discounts" className="text-sm font-medium">
            Enable automatic price drop offers
          </label>
        </div>

        {rules.enable_discounts && (
          <>
            {/* Discount Type */}
            <div>
              <label className="block text-sm font-medium mb-2">Discount Type</label>
              <select
                value={rules.discount_type || ""}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    discount_type: e.target.value as "percent" | "fixed" | null,
                  })
                }
                className="w-full border rounded-lg px-3 py-2"
              >
                <option value="">Select type</option>
                <option value="percent">Percentage (%)</option>
                <option value="fixed">Fixed Amount ($)</option>
              </select>
            </div>

            {/* Discount Value */}
            {rules.discount_type && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  Discount Value
                  {rules.discount_type === "percent" ? " (%)" : " ($)"}
                </label>
                <input
                  type="number"
                  value={rules.discount_value}
                  onChange={(e) =>
                    setRules({ ...rules, discount_value: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full border rounded-lg px-3 py-2"
                  min="0"
                  step={rules.discount_type === "percent" ? "1" : "50"}
                />
              </div>
            )}

            {/* Monthly Limit */}
            <div>
              <label className="block text-sm font-medium mb-2">Monthly Discount Limit</label>
              <input
                type="number"
                value={rules.monthly_limit}
                onChange={(e) =>
                  setRules({ ...rules, monthly_limit: parseInt(e.target.value) || 5 })
                }
                className="w-full border rounded-lg px-3 py-2"
                min="1"
                max="50"
              />
              <p className="text-xs text-gray-500 mt-1">
                Maximum number of discounted quotes per month (used: {rules.used_this_month})
              </p>
            </div>
          </>
        )}

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}


































