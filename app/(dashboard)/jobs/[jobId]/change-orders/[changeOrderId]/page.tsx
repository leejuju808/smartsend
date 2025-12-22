"use client";

// Block 27700 — SmartSend Roofing Change Order Engine v1
// Change Order Detail Page

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface ChangeOrderItem {
  id: string;
  description: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
}

interface ChangeOrder {
  id: string;
  status: string;
  reason_category: string;
  created_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  items: ChangeOrderItem[];
  total: number;
}

export default function ChangeOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId as string;
  const changeOrderId = params.changeOrderId as string;

  const [changeOrder, setChangeOrder] = useState<ChangeOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    // Fetch change order details
    // Note: This would need a new API endpoint to fetch full details with items
    // For now, we'll fetch from the list and then get items separately
    fetch(`/api/job/${jobId}/change-orders`)
      .then((r) => r.json())
      .then((d) => {
        const co = d.orders?.find((o: any) => o.id === changeOrderId);
        if (!co) {
          setError("Change order not found");
          setLoading(false);
          return;
        }
        // Fetch items separately (would be better with a dedicated endpoint)
        // For now, we'll show basic info
        setChangeOrder({
          ...co,
          items: [],
          total: co.amount,
        });
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching change order:", err);
        setError(err.message);
        setLoading(false);
      });
  }, [jobId, changeOrderId]);

  const handleApprove = async () => {
    if (!confirm("Are you sure you want to approve this change order? This will update the job revenue.")) {
      return;
    }

    setApproving(true);
    try {
      const response = await fetch(`/api/change-order/${changeOrderId}/approve`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to approve change order");
      }

      router.push(`/jobs/${jobId}/change-orders`);
    } catch (err: any) {
      console.error("Error approving change order:", err);
      setError(err.message || "Failed to approve change order");
      setApproving(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

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

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-zinc-400">Loading change order...</div>
      </div>
    );
  }

  if (error || !changeOrder) {
    return (
      <div className="p-6">
        <div className="text-sm text-red-400">Error: {error || "Change order not found"}</div>
        <Link
          href={`/jobs/${jobId}/change-orders`}
          className="mt-4 inline-block text-sm text-blue-400 hover:text-blue-300"
        >
          ← Back to Change Orders
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <Link
            href={`/jobs/${jobId}/change-orders`}
            className="text-sm text-blue-400 hover:text-blue-300 mb-2 inline-block"
          >
            ← Back to Change Orders
          </Link>
          <h1 className="text-2xl font-bold text-zinc-50">Change Order</h1>
          <p className="text-sm text-zinc-400 mt-1">
            ID: {changeOrder.id.slice(0, 8)}
          </p>
        </div>
        <div className="flex gap-2">
          {changeOrder.status === "draft" && (
            <button
              onClick={handleApprove}
              disabled={approving}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {approving ? "Approving..." : "Approve"}
            </button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-wide">Status</label>
            <div className="mt-1">
              <span
                className={`inline-flex px-2 py-1 rounded text-xs font-medium ${getStatusColor(
                  changeOrder.status
                )}`}
              >
                {changeOrder.status.toUpperCase()}
              </span>
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-wide">Reason</label>
            <p className="mt-1 text-zinc-50 capitalize">
              {changeOrder.reason_category || "—"}
            </p>
          </div>
          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-wide">Created</label>
            <p className="mt-1 text-zinc-50">{formatDate(changeOrder.created_at)}</p>
          </div>
          {changeOrder.approved_at && (
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wide">Approved</label>
              <p className="mt-1 text-zinc-50">{formatDate(changeOrder.approved_at)}</p>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
        <h2 className="text-lg font-semibold text-zinc-50 mb-4">Line Items</h2>
        {changeOrder.items.length === 0 ? (
          <p className="text-zinc-400 text-sm">No items loaded. Full details coming soon.</p>
        ) : (
          <div className="space-y-2">
            {changeOrder.items.map((item) => (
              <div
                key={item.id}
                className="flex justify-between items-center p-3 bg-zinc-900 rounded-lg border border-zinc-800"
              >
                <div className="flex-1">
                  <p className="text-zinc-50">{item.description}</p>
                  <p className="text-xs text-zinc-400 mt-1">
                    {item.quantity} × {formatCurrency(item.unit_cost)}
                  </p>
                </div>
                <p className="text-zinc-50 font-medium">
                  {formatCurrency(item.line_total)}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-zinc-800 flex justify-between items-center">
          <span className="text-zinc-400">Total</span>
          <span className="text-xl font-bold text-zinc-50">
            {formatCurrency(changeOrder.total)}
          </span>
        </div>
      </div>
    </div>
  );
}



































