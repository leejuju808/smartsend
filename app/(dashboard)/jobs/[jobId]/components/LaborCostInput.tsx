// Block 25340 — SmartSend Roofing Job Costing & Profit Engine v1
// Labor Cost Input Component (TOT/TOI, Crew Size, Per-Square Rates)

"use client";

import { useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface LaborCost {
  id: string;
  crew_name: string;
  labor_type: "hourly" | "per_square";
  tot_hours?: number;
  toi_hours?: number;
  extra_hours?: number;
  crew_size?: number;
  hourly_rate?: number;
  per_square_rate?: number;
  squares?: number;
  decking_labor_hours?: number;
  repair_labor_hours?: number;
  overtime_hours?: number;
  overtime_rate_multiplier?: number;
  total_cost: number;
  notes?: string;
}

export function LaborCostInput({ jobId }: { jobId: string }) {
  const { data, error, mutate } = useSWR<{ labor_costs: LaborCost[] }>(
    `/api/jobs/${jobId}/labor`,
    fetcher
  );

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<LaborCost>>({
    labor_type: "hourly",
    crew_size: 1,
    overtime_rate_multiplier: 1.5,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = `/api/jobs/${jobId}/labor`;
    const method = editingId ? "POST" : "POST";
    const body = editingId ? { ...formData, id: editingId } : formData;

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      mutate();
      setShowForm(false);
      setEditingId(null);
      setFormData({ labor_type: "hourly", crew_size: 1, overtime_rate_multiplier: 1.5 });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this labor cost entry?")) return;
    const res = await fetch(`/api/jobs/${jobId}/labor?id=${id}`, { method: "DELETE" });
    if (res.ok) mutate();
  };

  const handleEdit = (cost: LaborCost) => {
    setEditingId(cost.id);
    setFormData(cost);
    setShowForm(true);
  };

  const laborCosts = data?.labor_costs || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-200">Labor Costs</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-md text-zinc-200"
        >
          {showForm ? "Cancel" : "+ Add Labor"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-3 p-4 bg-zinc-900 rounded-lg border border-zinc-800">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Crew Name</label>
              <input
                type="text"
                required
                value={formData.crew_name || ""}
                onChange={(e) => setFormData({ ...formData, crew_name: e.target.value })}
                className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Labor Type</label>
              <select
                value={formData.labor_type || "hourly"}
                onChange={(e) => setFormData({ ...formData, labor_type: e.target.value as "hourly" | "per_square" })}
                className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200"
              >
                <option value="hourly">Hourly</option>
                <option value="per_square">Per Square</option>
              </select>
            </div>
          </div>

          {formData.labor_type === "hourly" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">TOT Hours (Tear-Off)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.tot_hours || ""}
                    onChange={(e) => setFormData({ ...formData, tot_hours: parseFloat(e.target.value) || 0 })}
                    className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">TOI Hours (Install)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.toi_hours || ""}
                    onChange={(e) => setFormData({ ...formData, toi_hours: parseFloat(e.target.value) || 0 })}
                    className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Extra Hours</label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.extra_hours || ""}
                    onChange={(e) => setFormData({ ...formData, extra_hours: parseFloat(e.target.value) || 0 })}
                    className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Decking Hours</label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.decking_labor_hours || ""}
                    onChange={(e) => setFormData({ ...formData, decking_labor_hours: parseFloat(e.target.value) || 0 })}
                    className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Repair Hours</label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.repair_labor_hours || ""}
                    onChange={(e) => setFormData({ ...formData, repair_labor_hours: parseFloat(e.target.value) || 0 })}
                    className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Crew Size</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.crew_size || 1}
                    onChange={(e) => setFormData({ ...formData, crew_size: parseInt(e.target.value) || 1 })}
                    className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Hourly Rate ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.hourly_rate || ""}
                    onChange={(e) => setFormData({ ...formData, hourly_rate: parseFloat(e.target.value) || 0 })}
                    className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Overtime Hours</label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.overtime_hours || ""}
                    onChange={(e) => setFormData({ ...formData, overtime_hours: parseFloat(e.target.value) || 0 })}
                    className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200"
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Per Square Rate ($)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={formData.per_square_rate || ""}
                  onChange={(e) => setFormData({ ...formData, per_square_rate: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Squares</label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={formData.squares || ""}
                  onChange={(e) => setFormData({ ...formData, squares: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Notes</label>
            <textarea
              value={formData.notes || ""}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-200"
              rows={2}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm text-white"
            >
              {editingId ? "Update" : "Add"} Labor Cost
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setFormData({ labor_type: "hourly", crew_size: 1, overtime_rate_multiplier: 1.5 });
                }}
                className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-sm text-zinc-200"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {laborCosts.length > 0 && (
        <div className="space-y-2">
          {laborCosts.map((cost) => (
            <div key={cost.id} className="p-3 bg-zinc-900 rounded-lg border border-zinc-800">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-zinc-200">{cost.crew_name}</span>
                    <span className="text-xs text-zinc-500">
                      ({cost.labor_type === "hourly" ? "Hourly" : "Per Square"})
                    </span>
                  </div>
                  {cost.labor_type === "hourly" && (
                    <div className="text-xs text-zinc-400 space-y-0.5">
                      {cost.tot_hours > 0 && <div>TOT: {cost.tot_hours}h</div>}
                      {cost.toi_hours > 0 && <div>TOI: {cost.toi_hours}h</div>}
                      {cost.extra_hours > 0 && <div>Extra: {cost.extra_hours}h</div>}
                      {cost.decking_labor_hours > 0 && <div>Decking: {cost.decking_labor_hours}h</div>}
                      {cost.repair_labor_hours > 0 && <div>Repair: {cost.repair_labor_hours}h</div>}
                      {cost.overtime_hours > 0 && <div>Overtime: {cost.overtime_hours}h</div>}
                      <div>Crew Size: {cost.crew_size || 1}</div>
                      <div>Rate: ${cost.hourly_rate?.toFixed(2)}/hr</div>
                    </div>
                  )}
                  {cost.labor_type === "per_square" && (
                    <div className="text-xs text-zinc-400">
                      {cost.squares} sq × ${cost.per_square_rate?.toFixed(2)}/sq
                    </div>
                  )}
                  {cost.notes && (
                    <div className="text-xs text-zinc-500 mt-1 italic">{cost.notes}</div>
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

      {laborCosts.length === 0 && !showForm && (
        <div className="text-sm text-zinc-500 text-center py-4">
          No labor costs recorded yet.
        </div>
      )}
    </div>
  );
}




































