"use client";

// Block 27700 — SmartSend Roofing Change Order Engine v1
// Change Orders List Page

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface ChangeOrder {
  id: string;
  status: string;
  reason_category: string;
  created_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  amount: number;
}

export default function ChangeOrdersPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId as string;
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/job/${jobId}/change-orders`)
      .then((r) => {
        if (!r.ok) {
          throw new Error("Failed to fetch change orders");
        }
        return r.json();
      })
      .then((d) => {
        setChangeOrders(d.orders || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching change orders:", err);
        setError(err.message);
        setLoading(false);
      });
  }, [jobId]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved":
        return "text-green-400 bg-green-400/10";
      case "rejected":
        return "text-red-400 bg-red-400/10";
      case "sent":
        return "text-yellow-400 bg-yellow-400/10";
      default:
        return "text-zinc-400 bg-zinc-400/10";
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-zinc-400">Loading change orders...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-sm text-red-400">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">Change Orders</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Track mid-job changes and revenue adjustments
          </p>
        </div>
        <Link
          href={`/jobs/${jobId}/new-change-order`}
          className="px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-zinc-900 transition-colors"
        >
          New Change Order
        </Link>
      </div>

      {changeOrders.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-center">
          <p className="text-zinc-400 mb-4">No change orders yet</p>
          <Link
            href={`/jobs/${jobId}/new-change-order`}
            className="inline-block px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-zinc-900 transition-colors"
          >
            Create First Change Order
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-800">
                <th align="left" className="p-4 font-medium">ID</th>
                <th align="left" className="p-4 font-medium">Reason</th>
                <th align="left" className="p-4 font-medium">Status</th>
                <th align="right" className="p-4 font-medium">Amount</th>
                <th align="left" className="p-4 font-medium">Created</th>
                <th align="left" className="p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {changeOrders.map((co) => (
                <tr
                  key={co.id}
                  className="border-b border-zinc-800 last:border-0 hover:bg-zinc-900/50 transition-colors"
                >
                  <td className="p-4 text-zinc-300 font-mono text-xs">
                    {co.id.slice(0, 8)}
                  </td>
                  <td className="p-4 text-zinc-300 capitalize">
                    {co.reason_category || "—"}
                  </td>
                  <td className="p-4">
                    <span
                      className={`inline-flex px-2 py-1 rounded text-xs font-medium ${getStatusColor(
                        co.status
                      )}`}
                    >
                      {co.status.toUpperCase()}
                    </span>
                  </td>
                  <td align="right" className="p-4 text-zinc-50 font-medium">
                    {formatCurrency(co.amount)}
                  </td>
                  <td className="p-4 text-zinc-400 text-xs">
                    {formatDate(co.created_at)}
                  </td>
                  <td className="p-4">
                    <Link
                      className="underline text-blue-400 hover:text-blue-300 text-sm"
                      href={`/jobs/${jobId}/change-orders/${co.id}`}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}



































