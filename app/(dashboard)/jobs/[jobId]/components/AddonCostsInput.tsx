// Block 25340 — SmartSend Roofing Job Costing & Profit Engine v1
// Addon Costs Input Component (Wood, Dumpster, Repairs, etc.)

"use client";

import { useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface AddonCost {
  id: string;
  addon_type: string;
  description: string;
  quantity: number;
  unit?: string;
  unit_cost: number;
  total_cost: number;
  is_supplement_eligible: boolean;
  supplement_status?: string;
  supplement_amount?: number;
}

const ADDON_TYPES = [
  { value: "wood_replacement", label: "Wood Replacement" },
  { value: "dumpster", label: "Dumpster/Dump Fees" },
  { value: "repair", label: "Additional Repairs" },
  { value: "skylight_replacement", label: "Skylight Replacement" },
  { value: "plumbing_boot_change", label: "Plumbing Boot Change" },
  { value: "permit", label: "Permit Fees" },
  { value: "equipment_rental", label: "Equipment Rental" },
  { value: "gas_travel", label: "Gas/Travel" },
  { value: "change_order", label: "Change Order" },
  { value: "other", label: "Other" },
];

export function AddonCostsInput({ jobId }: { jobId: string }) {
  const { data, error, mutate } = useSWR<{ addon_costs: AddonCost[] }>(
    `/api/jobs/${jobId}/addon-costs`,
    fetcher
  );

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<AddonCost>>({
    quantity: 1,
    is_supplement_eligible: false,
    supplement_status: "not_submitted",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = `/api/jobs/${jobId}/addon-costs`;
    const body = editingId ? { ...formData, id: editingId } : formData;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      mutate();
      setShowForm(false);
      setEditingId(null);
      setFormData({ quantity: 1, is_supplement_eligible: false, supplement_status: "not_submitted" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this addon cost?")) return;
    const res = await fetch(`/api/jobs/${jobId}/addon-costs?id=${id}`, { method: "DELETE" });
    if (res.ok) mutate();
  };

  const handleEdit = (cost: AddonCost) => {
    setEditingId(cost.id);
    setFormData(cost);
    setShowForm(true);
  };

  const addonCosts = data?.addon_costs || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-200">Additional Costs</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-md text-zinc-200"
        >
          {showForm ? "Cancel" : "+ Add Cost"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-3 p-4 bg-zinc-900 rounded-lg border border-zinc-800">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Cost Type</label>
              <select
                required
                value={formData.addon_type || ""}
                onChange={(e) => setFormData({ ...formData, addon_type: e.target.value })}
                className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200"
              >
                <option value="">Select type...</option>
                {ADDON_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Description</label>
              <input
                type="text"
                required
                value={formData.description || ""}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200"
                placeholder="e.g., 10 sheets plywood"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Quantity</label>
              <input
                type="number"
                step="0.01"
                required
                value={formData.quantity || 1}
                onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 1 })}
                className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Unit</label>
              <input
                type="text"
                value={formData.unit || ""}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200"
                placeholder="sheets, dumpsters, etc."
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Unit Cost ($)</label>
              <input
                type="number"
                step="0.01"
                required
                value={formData.unit_cost || ""}
                onChange={(e) => setFormData({ ...formData, unit_cost: parseFloat(e.target.value) || 0 })}
                className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.is_supplement_eligible || false}
                onChange={(e) => setFormData({ ...formData, is_supplement_eligible: e.target.checked })}
                className="w-4 h-4"
              />
              <label className="text-xs text-zinc-400">Supplement Eligible (Insurance)</label>
            </div>
            {formData.is_supplement_eligible && (
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Supplement Status</label>
                <select
                  value={formData.supplement_status || "not_submitted"}
                  onChange={(e) => setFormData({ ...formData, supplement_status: e.target.value })}
                  className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200"
                >
                  <option value="not_submitted">Not Submitted</option>
                  <option value="submitted">Submitted</option>
                  <option value="approved">Approved</option>
                  <option value="denied">Denied</option>
                </select>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm text-white"
            >
              {editingId ? "Update" : "Add"} Cost
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setFormData({ quantity: 1, is_supplement_eligible: false, supplement_status: "not_submitted" });
                }}
                className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-sm text-zinc-200"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {addonCosts.length > 0 && (
        <div className="space-y-2">
          {addonCosts.map((cost) => (
            <div key={cost.id} className="p-3 bg-zinc-900 rounded-lg border border-zinc-800">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-zinc-200">
                      {ADDON_TYPES.find((t) => t.value === cost.addon_type)?.label || cost.addon_type}
                    </span>
                    {cost.is_supplement_eligible && (
                      <span className="text-xs px-1.5 py-0.5 bg-blue-900/30 text-blue-400 rounded">
                        Supplement
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-400">
                    {cost.description}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">
                    {cost.quantity} {cost.unit || "units"} × ${cost.unit_cost?.toFixed(2)}
                  </div>
                  {cost.supplement_status && cost.supplement_status !== "not_submitted" && (
                    <div className="text-xs text-zinc-500 mt-1">
                      Supplement: {cost.supplement_status}
                      {cost.supplement_amount && ` ($${cost.supplement_amount.toFixed(2)})`}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-zinc-200">
                    ${cost.total_cost?.toFixed(2) || "0.00"}
                  </div>
                  <div className="flex gap-1 mt-1">
                    <button
                      onClick={() => handleEdit(cost)}
                      className="text-xs px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(cost.id)}
                      className="text-xs px-2 py-0.5 bg-red-900/30 hover:bg-red-900/50 rounded text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {addonCosts.length === 0 && !showForm && (
        <div className="text-sm text-zinc-500 text-center py-4">
          No additional costs recorded yet.
        </div>
      )}
    </div>
  );
}




































