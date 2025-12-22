"use client";

// Block 27760 — SmartSend Roofing Material Order Automation v1
// Materials Page Component for Job Detail
// Shows material order, items, and send to supplier functionality

import { useEffect, useState } from "react";

export default function JobMaterialsPage({ params }: { params: Promise<{ id: string }> }) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [sending, setSending] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    params.then((p) => setJobId(p.id));
  }, [params]);

  const load = async () => {
    if (!jobId) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/job/${jobId}/materials`);
      if (!res.ok) {
        throw new Error("Failed to load materials");
      }
      const json = await res.json();
      setData(json);
    } catch (error) {
      console.error("Error loading materials:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (jobId) {
      load();
    }
  }, [jobId]);

  if (loading) {
    return <div className="p-6">Loading materials...</div>;
  }

  if (!data) {
    return <div className="p-6">Failed to load materials</div>;
  }

  const { order, items } = data;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Material Order</h1>
        {!order && (
          <button
            onClick={async () => {
              setGenerating(true);
              try {
                await fetch(`/api/job/${jobId}/generate-material-order`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ waste_factor: 0.1 }),
                });
                await load();
              } catch (error) {
                console.error("Error generating order:", error);
              } finally {
                setGenerating(false);
              }
            }}
            disabled={generating}
            className="px-4 py-2 text-sm rounded-lg bg-black text-white disabled:opacity-50"
          >
            {generating ? "Generating..." : "Generate Draft Order"}
          </button>
        )}
      </div>

      {order && (
        <>
          <div className="rounded-xl border bg-white shadow-sm p-4 text-sm space-y-1">
            <div>
              Status: <b>{order.status.toUpperCase()}</b>
            </div>
            <div>Delivery Date: {order.delivery_date || "Not set"}</div>
            <div>Delivery Window: {order.delivery_window || "Any"}</div>
            <div>Drop Location: {order.drop_location || "Driveway"}</div>
            {order.supplier_reference && (
              <div>Supplier Reference: {order.supplier_reference}</div>
            )}
          </div>

          <div className="rounded-xl border bg-white shadow-sm p-4">
            <h2 className="font-semibold text-sm mb-3">Items</h2>
            {items && items.length > 0 ? (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b">
                    <th align="left" className="pb-2">Category</th>
                    <th align="left" className="pb-2">Description</th>
                    <th align="right" className="pb-2">Qty</th>
                    <th align="left" className="pb-2">Unit</th>
                    <th align="left" className="pb-2">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i: any) => (
                    <tr key={i.id} className="border-b last:border-0">
                      <td className="py-2">{i.category}</td>
                      <td className="py-2">{i.description}</td>
                      <td align="right" className="py-2">{i.quantity}</td>
                      <td className="py-2">{i.unit}</td>
                      <td className="py-2">
                        <span className={`px-2 py-1 rounded text-xs ${
                          i.source === "change_order" 
                            ? "bg-yellow-100 text-yellow-800" 
                            : "bg-gray-100 text-gray-800"
                        }`}>
                          {i.source}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-gray-500">No items in this order</p>
            )}
          </div>

          {order.status === "draft" && (
            <button
              disabled={sending}
              onClick={async () => {
                setSending(true);
                try {
                  await fetch(`/api/material-order/${order.id}/send`, {
                    method: "POST",
                  });
                  await load();
                } catch (error) {
                  console.error("Error sending order:", error);
                } finally {
                  setSending(false);
                }
              }}
              className="px-4 py-2 rounded-lg bg-black text-white text-sm disabled:opacity-50"
            >
              {sending ? "Sending..." : "Send to Supplier"}
            </button>
          )}

          {order.notes && (
            <div className="rounded-xl border bg-white shadow-sm p-4">
              <h2 className="font-semibold text-sm mb-2">Notes</h2>
              <p className="text-sm text-gray-700">{order.notes}</p>
            </div>
          )}
        </>
      )}

      {!order && (
        <div className="rounded-xl border bg-gray-50 p-8 text-center">
          <p className="text-gray-500 mb-4">No material order created yet</p>
          <button
            onClick={async () => {
              setGenerating(true);
              try {
                await fetch(`/api/job/${jobId}/generate-material-order`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ waste_factor: 0.1 }),
                });
                await load();
              } catch (error) {
                console.error("Error generating order:", error);
              } finally {
                setGenerating(false);
              }
            }}
            disabled={generating}
            className="px-4 py-2 rounded-lg bg-black text-white text-sm disabled:opacity-50"
          >
            {generating ? "Generating..." : "Generate Draft Order"}
          </button>
        </div>
      )}
    </div>
  );
}



































