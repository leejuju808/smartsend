"use client";

// Block 27700 — SmartSend Roofing Change Order Engine v1
// New Change Order Page

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";

interface ChangeOrderItem {
  description: string;
  quantity: number;
  unit_cost: number;
}

export default function NewChangeOrderPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId as string;

  const [reasonCategory, setReasonCategory] = useState<string>("discovery");
  const [items, setItems] = useState<ChangeOrderItem[]>([
    { description: "", quantity: 1, unit_cost: 0 },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addItem = () => {
    setItems([...items, { description: "", quantity: 1, unit_cost: 0 }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof ChangeOrderItem, value: string | number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const calculateTotal = () => {
    return items.reduce(
      (sum, item) => sum + item.quantity * item.unit_cost,
      0
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validate
    if (items.some((item) => !item.description.trim())) {
      setError("Please fill in all item descriptions");
      setLoading(false);
      return;
    }

    if (items.some((item) => item.quantity <= 0 || item.unit_cost <= 0)) {
      setError("All items must have quantity > 0 and unit cost > 0");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/change-order/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          job_id: jobId,
          reason_category: reasonCategory,
          items: items.map((item) => ({
            description: item.description,
            quantity: parseFloat(item.quantity.toString()),
            unit_cost: parseFloat(item.unit_cost.toString()),
          })),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create change order");
      }

      const data = await response.json();
      router.push(`/jobs/${jobId}/change-orders`);
    } catch (err: any) {
      console.error("Error creating change order:", err);
      setError(err.message || "Failed to create change order");
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-50">New Change Order</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Document mid-job changes and update job revenue
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
          <label className="block text-sm font-medium text-zinc-300 mb-2">
            Reason Category
          </label>
          <select
            value={reasonCategory}
            onChange={(e) => setReasonCategory(e.target.value)}
            className="w-full px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="discovery">Discovery (unexpected work found)</option>
            <option value="upgrade">Upgrade (homeowner requested)</option>
            <option value="code-required">Code Required (building code compliance)</option>
          </select>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-zinc-50">Line Items</h2>
            <button
              type="button"
              onClick={addItem}
              className="px-3 py-1.5 text-sm bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-colors"
            >
              + Add Item
            </button>
          </div>

          <div className="space-y-4">
            {items.map((item, index) => (
              <div
                key={index}
                className="grid grid-cols-12 gap-4 p-4 bg-zinc-900 rounded-lg border border-zinc-800"
              >
                <div className="col-span-5">
                  <input
                    type="text"
                    placeholder="Item description"
                    value={item.description}
                    onChange={(e) =>
                      updateItem(index, "description", e.target.value)
                    }
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-zinc-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div className="col-span-2">
                  <input
                    type="number"
                    placeholder="Qty"
                    value={item.quantity}
                    onChange={(e) =>
                      updateItem(index, "quantity", parseFloat(e.target.value) || 0)
                    }
                    min="0.01"
                    step="0.01"
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-zinc-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div className="col-span-3">
                  <input
                    type="number"
                    placeholder="Unit Cost"
                    value={item.unit_cost}
                    onChange={(e) =>
                      updateItem(index, "unit_cost", parseFloat(e.target.value) || 0)
                    }
                    min="0.01"
                    step="0.01"
                    className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded text-zinc-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div className="col-span-1 flex items-center justify-center">
                  <span className="text-zinc-300 text-sm font-medium">
                    ${(item.quantity * item.unit_cost).toFixed(2)}
                  </span>
                </div>
                <div className="col-span-1 flex items-center justify-center">
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-zinc-800 flex justify-between items-center">
            <span className="text-zinc-400 text-sm">Total</span>
            <span className="text-xl font-bold text-zinc-50">
              ${calculateTotal().toFixed(2)}
            </span>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-400/10 border border-red-400/20 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-black text-white rounded-lg hover:bg-zinc-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Creating..." : "Create Change Order"}
          </button>
        </div>
      </form>
    </div>
  );
}



































