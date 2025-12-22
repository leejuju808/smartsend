"use client";

// Block 27280 — SmartSend Roofing Deposit & Payment Request Engine v1
// Payments Page Component for Job Detail
// Shows payment summary, payment requests, and deposit creation UI

import { useEffect, useState } from "react";

export default function JobPaymentsPage({ params }: { params: Promise<{ id: string }> }) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    params.then((p) => setJobId(p.id));
  }, [params]);

  const load = async () => {
    if (!jobId) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/job/${jobId}/payments`);
      if (!res.ok) {
        throw new Error("Failed to load payments");
      }
      const data = await res.json();
      setSummary(data.summary);
      setRequests(data.requests);
    } catch (error) {
      console.error("Error loading payments:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (jobId) {
      load();
    }
  }, [jobId]);

  const createDeposit = async () => {
    if (!jobId) return;
    
    setCreating(true);
    try {
      const res = await fetch(`/api/job/${jobId}/create-deposit-request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ deposit_percentage: 0.4 }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create deposit request");
      }

      const data = await res.json();
      if (data.payment_link_url) {
        await load();
      }
    } catch (error: any) {
      console.error("Error creating deposit:", error);
      alert(error.message || "Failed to create deposit request");
    } finally {
      setCreating(false);
    }
  };

  const markAsPaid = async (requestId: string) => {
    try {
      const res = await fetch(`/api/payment-request/${requestId}/mark-paid`, {
        method: "POST",
      });

      if (!res.ok) {
        throw new Error("Failed to mark as paid");
      }

      await load();
    } catch (error) {
      console.error("Error marking as paid:", error);
      alert("Failed to mark payment as paid");
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-gray-500">Loading payments...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Payments</h1>
        <button
          disabled={creating}
          onClick={createDeposit}
          className="px-4 py-2 rounded-lg bg-black text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-800 transition-colors"
        >
          {creating ? "Creating..." : "Request Deposit"}
        </button>
      </div>

      {summary && (
        <div className="rounded-xl border bg-white shadow-sm p-4 text-sm space-y-1">
          <div>
            Contract Amount:{" "}
            <b>${Number(summary.contract_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
          </div>
          <div>
            Paid:{" "}
            <span className="text-green-700 font-semibold">
              ${Number(summary.total_paid || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div>
            Unpaid Requests:{" "}
            <span className="text-yellow-700 font-semibold">
              ${Number(summary.total_unpaid || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div>
            Remaining Balance:{" "}
            <span className="text-red-700 font-semibold">
              ${Number(summary.remaining_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-white shadow-sm p-4">
        <h2 className="font-semibold mb-3 text-sm">Payment Requests</h2>
        {requests.length === 0 ? (
          <p className="text-sm text-gray-500">No payment requests yet.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b">
                <th align="left" className="pb-2">Type</th>
                <th align="right" className="pb-2">Amount</th>
                <th align="left" className="pb-2">Status</th>
                <th align="left" className="pb-2">Due</th>
                <th align="left" className="pb-2">Link</th>
                <th align="left" className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2">{r.request_type?.toUpperCase() || "DEPOSIT"}</td>
                  <td align="right" className="py-2">
                    ${Number(r.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td
                    className={`py-2 ${
                      r.status === "paid"
                        ? "text-green-700 font-semibold"
                        : r.status === "overdue"
                        ? "text-red-700 font-semibold"
                        : "text-gray-700"
                    }`}
                  >
                    {r.status?.toUpperCase() || "PENDING"}
                  </td>
                  <td className="py-2">{r.due_date ? new Date(r.due_date).toLocaleDateString() : "—"}</td>
                  <td className="py-2">
                    {r.payment_link_url ? (
                      <a
                        href={r.payment_link_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline text-blue-600 hover:text-blue-800"
                      >
                        Open
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2">
                    {r.status !== "paid" && (
                      <button
                        onClick={() => markAsPaid(r.id)}
                        className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                      >
                        Mark Paid
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}



































