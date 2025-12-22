"use client";

// Block 27640 — SmartSend Roofing Insurance Supplement Intelligence v1
// UI Page: Insurance Supplements Dashboard

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface SupplementRecommendation {
  id: string;
  job_id: string;
  line_item: string;
  reason: string | null;
  estimated_cost: number | null;
  status: "pending" | "submitted" | "approved" | "rejected";
  created_at: string;
  updated_at: string;
}

interface SupplementRevenue {
  id: string;
  job_id: string;
  approved_amount: number;
  adjuster_name: string | null;
  adjuster_email: string | null;
  approved_at: string | null;
  created_at: string;
}

interface SupplementsData {
  items: SupplementRecommendation[];
  revenue: SupplementRevenue[];
  totals: {
    pending: number;
    approved: number;
  };
}

export default function JobSupplementsPage() {
  const params = useParams();
  const jobId = params.jobId as string;

  const [data, setData] = useState<SupplementsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scopeText, setScopeText] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [packetHtml, setPacketHtml] = useState<string | null>(null);
  const [showScopeInput, setShowScopeInput] = useState(false);

  useEffect(() => {
    fetchSupplements();
  }, [jobId]);

  const fetchSupplements = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch(`/api/jobs/${jobId}/supplements`);

      if (!res.ok) {
        throw new Error("Failed to fetch supplements");
      }

      const data = await res.json();
      setData(data);
    } catch (err: any) {
      setError(err.message || "Failed to load supplements");
    } finally {
      setIsLoading(false);
    }
  };

  const handleParseScope = async () => {
    if (!scopeText.trim()) {
      setError("Please enter scope text");
      return;
    }

    setIsParsing(true);
    setError(null);

    try {
      const res = await fetch(`/api/jobs/${jobId}/supplements/parse-scope`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ scope_text: scopeText }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to parse scope");
      }

      const result = await res.json();
      setScopeText("");
      setShowScopeInput(false);
      await fetchSupplements(); // Refresh recommendations
    } catch (err: any) {
      setError(err.message || "Failed to parse scope");
    } finally {
      setIsParsing(false);
    }
  };

  const handleGeneratePacket = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch(`/api/jobs/${jobId}/supplements/generate-packet`, {
        method: "POST",
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to generate packet");
      }

      const result = await res.json();
      setPacketHtml(result.html);
    } catch (err: any) {
      setError(err.message || "Failed to generate supplement packet");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/supplements/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to update status");
      }

      await fetchSupplements(); // Refresh
    } catch (err: any) {
      setError(err.message || "Failed to update status");
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="text-sm text-zinc-400">Loading supplements...</div>
      </div>
    );
  }

  const items = data?.items || [];
  const revenue = data?.revenue || [];
  const totals = data?.totals || { pending: 0, approved: 0 };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">Insurance Supplements</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Detect underpaid claims, recommend supplements, and track revenue
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowScopeInput(!showScopeInput)}
            className="px-4 py-2 rounded-lg border border-zinc-800 text-zinc-300 text-sm font-medium hover:bg-zinc-900 transition-colors"
          >
            {showScopeInput ? "Cancel" : "Upload Scope"}
          </button>
          {items.length > 0 && (
            <button
              onClick={handleGeneratePacket}
              disabled={isGenerating}
              className="px-4 py-2 rounded-lg bg-black text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isGenerating ? "Generating..." : "Generate Supplement Packet"}
            </button>
          )}
        </div>
      </div>

      {/* Revenue Summary */}
      {(totals.pending > 0 || totals.approved > 0) && (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Pending Supplements
            </p>
            <p className="text-2xl font-bold text-zinc-50 mt-2">
              ${totals.pending.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Approved Revenue
            </p>
            <p className="text-2xl font-bold text-green-400 mt-2">
              ${totals.approved.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      )}

      {/* Scope Input */}
      {showScopeInput && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-3">
          <h2 className="font-semibold text-zinc-50">Upload Insurance Scope</h2>
          <p className="text-sm text-zinc-400">
            Paste the insurance scope text from PDF/Xactimate/etc. SmartSend will analyze it and recommend missing line items.
          </p>
          <textarea
            value={scopeText}
            onChange={(e) => setScopeText(e.target.value)}
            placeholder="Paste insurance scope text here..."
            className="w-full h-48 px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-50 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-700"
          />
          <button
            onClick={handleParseScope}
            disabled={isParsing || !scopeText.trim()}
            className="px-4 py-2 rounded-lg bg-black text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isParsing ? "Analyzing..." : "Analyze Scope"}
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/50 bg-red-500/10 p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Supplement Recommendations Table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <h2 className="font-semibold mb-3 text-zinc-50">Supplement Recommendations</h2>

        {items.length === 0 ? (
          <div className="text-sm text-zinc-400 py-8 text-center">
            No supplement recommendations yet. Upload an insurance scope to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-zinc-400 border-b border-zinc-800">
                  <th align="left" className="pb-2 pr-4">Line Item</th>
                  <th align="left" className="pb-2 pr-4">Reason</th>
                  <th align="right" className="pb-2 pr-4">Estimated Cost</th>
                  <th align="left" className="pb-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-zinc-800 last:border-0 hover:bg-zinc-900/50"
                  >
                    <td className="py-3 pr-4 text-zinc-50 font-medium">{item.line_item}</td>
                    <td className="py-3 pr-4 text-zinc-400">{item.reason || "—"}</td>
                    <td align="right" className="py-3 pr-4 text-zinc-50">
                      ${(item.estimated_cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 pr-4">
                      <select
                        value={item.status}
                        onChange={(e) => handleUpdateStatus(item.id, e.target.value)}
                        className={`px-2 py-1 rounded text-xs font-medium border-0 bg-transparent cursor-pointer ${
                          item.status === "approved"
                            ? "text-green-400"
                            : item.status === "submitted"
                            ? "text-blue-400"
                            : item.status === "rejected"
                            ? "text-red-400"
                            : "text-zinc-400"
                        }`}
                      >
                        <option value="pending">PENDING</option>
                        <option value="submitted">SUBMITTED</option>
                        <option value="approved">APPROVED</option>
                        <option value="rejected">REJECTED</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Supplement Revenue History */}
      {revenue.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <h2 className="font-semibold mb-3 text-zinc-50">Approved Supplement Revenue</h2>
          <div className="space-y-2">
            {revenue.map((rev) => (
              <div
                key={rev.id}
                className="flex items-center justify-between p-3 rounded-lg border border-zinc-800 bg-zinc-900/50"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-50">
                    ${rev.approved_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  {rev.adjuster_name && (
                    <p className="text-xs text-zinc-400 mt-1">
                      Adjuster: {rev.adjuster_name}
                    </p>
                  )}
                  {rev.approved_at && (
                    <p className="text-xs text-zinc-500 mt-1">
                      Approved: {new Date(rev.approved_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generated Packet Preview */}
      {packetHtml && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-zinc-50">Generated Supplement Packet</h2>
            <button
              onClick={() => {
                const printWindow = window.open("", "_blank");
                if (printWindow) {
                  printWindow.document.write(`
                    <!DOCTYPE html>
                    <html>
                      <head>
                        <title>Supplement Packet</title>
                        <style>
                          body { font-family: Arial, sans-serif; padding: 20px; }
                          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                          th { background-color: #f2f2f2; }
                        </style>
                      </head>
                      <body>
                        ${packetHtml}
                      </body>
                    </html>
                  `);
                  printWindow.document.close();
                  printWindow.print();
                }
              }}
              className="px-3 py-1 rounded text-xs bg-black text-white hover:bg-zinc-800"
            >
              Print/PDF
            </button>
          </div>
          <div
            className="prose prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: packetHtml }}
          />
        </div>
      )}
    </div>
  );
}
