"use client";

// Block 27140 — SmartSend Roofing Estimate & Proposal Generator v1
// UI Page: Proposal View

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function JobProposalPage() {
  const params = useParams();
  const jobId = params.jobId as string;
  
  const [estimate, setEstimate] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [building, setBuilding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/job/${jobId}/proposal`);
      
      if (!res.ok) {
        throw new Error("Failed to load proposal data");
      }
      
      const data = await res.json();
      setEstimate(data.estimate);
      setItems(data.line_items || []);
      setProposals(data.proposals || []);
    } catch (err: any) {
      console.error("Error loading proposal:", err);
      setError(err.message || "Failed to load proposal");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (jobId) {
      loadData();
    }
  }, [jobId]);

  const build = async () => {
    try {
      setBuilding(true);
      setError(null);
      const res = await fetch(`/api/job/${jobId}/build-estimate-proposal`, {
        method: "POST",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to build proposal");
      }

      await loadData();
    } catch (err: any) {
      console.error("Error building proposal:", err);
      setError(err.message || "Failed to build proposal");
    } finally {
      setBuilding(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-gray-500">Loading proposal...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-50">Estimate & Proposal</h1>
        <button
          onClick={build}
          disabled={building}
          className="px-4 py-2 rounded-lg bg-black text-white text-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {building ? "Building..." : "Build from AI Insights"}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {estimate && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
            Estimate v{estimate.version}
          </div>
          <div className="font-semibold text-zinc-50 mt-1 mb-2">Project Summary</div>
          <div className="text-sm text-zinc-300">{estimate.summary || "No summary available"}</div>
          {estimate.total_price > 0 && (
            <div className="mt-3 text-lg font-bold text-zinc-50">
              Total: ${Number(estimate.total_price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          )}
        </div>
      )}

      {/* Good / Better / Best cards */}
      {proposals.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {proposals.map((p) => (
            <div
              key={p.id}
              className={`rounded-xl border bg-zinc-950 shadow-sm p-4 flex flex-col justify-between ${
                p.tier === "best" ? "border-yellow-500 border-2" : "border-zinc-800"
              }`}
            >
              <div>
                <div className="text-xs uppercase text-gray-500 mb-1 font-semibold">
                  {p.tier.toUpperCase()}
                </div>
                <div className="font-bold text-zinc-50 mb-1 text-lg">{p.title}</div>
                <div className="text-xs text-gray-400 mb-2">{p.subtitle}</div>
                <div className="text-2xl font-bold text-zinc-50 mb-3">
                  ${Number(p.price || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
                <ul className="text-xs text-zinc-300 space-y-1 mb-3">
                  {p.features?.map((f: string, i: number) => (
                    <li key={i} className="flex items-start">
                      <span className="mr-2">•</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="text-[11px] text-gray-400 mt-2 pt-2 border-t border-zinc-800">
                {p.warranty_text}
              </div>
              {p.notes && (
                <div className="text-[11px] text-gray-500 mt-2 italic">
                  {p.notes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Line items (optional internal view) */}
      {items.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <h2 className="font-semibold mb-3 text-sm text-zinc-50">Estimate Line Items</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-zinc-800">
                  <th align="left" className="pb-2">Category</th>
                  <th align="left" className="pb-2">Description</th>
                  <th align="right" className="pb-2">Qty</th>
                  <th align="left" className="pb-2">Unit</th>
                  <th align="right" className="pb-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((li) => (
                  <tr key={li.id} className="border-b border-zinc-800 last:border-0 text-zinc-300">
                    <td className="py-2">{li.category || "—"}</td>
                    <td className="py-2">{li.description}</td>
                    <td align="right" className="py-2">{li.quantity}</td>
                    <td className="py-2">{li.unit || "—"}</td>
                    <td align="right" className="py-2">
                      {li.total_price ? `$${Number(li.total_price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              {estimate && estimate.total_price > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-zinc-700">
                    <td colSpan={4} align="right" className="py-2 font-semibold text-zinc-50">
                      Total:
                    </td>
                    <td align="right" className="py-2 font-semibold text-zinc-50">
                      ${Number(estimate.total_price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!estimate && !loading && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-8 text-center">
          <p className="text-zinc-400 mb-4">No estimate or proposal generated yet.</p>
          <button
            onClick={build}
            disabled={building}
            className="px-4 py-2 rounded-lg bg-black text-white text-sm hover:opacity-90 disabled:opacity-50"
          >
            {building ? "Building..." : "Generate Estimate & Proposal"}
          </button>
        </div>
      )}

      {/* Export / Send Buttons */}
      {estimate && proposals.length > 0 && (
        <div className="flex gap-3">
          <button className="px-4 py-2 border border-zinc-800 rounded-lg text-sm text-zinc-300 hover:bg-zinc-900">
            Export Proposal PDF
          </button>
          <button className="px-4 py-2 border border-zinc-800 rounded-lg text-sm text-zinc-300 hover:bg-zinc-900">
            Send Proposal via Email
          </button>
        </div>
      )}
    </div>
  );
}



































