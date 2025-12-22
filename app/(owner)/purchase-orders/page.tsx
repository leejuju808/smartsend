"use client";

// Block 48000 — SmartSend Roofing "Inventory + Supplier Purchase Order System" v1
// Purchase Orders List Page
// Shows pending, sent, and delivered POs

import { useEffect, useState } from "react";
import { FileText, Eye, CheckCircle, Clock, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

interface PurchaseOrder {
  id: string;
  job_id: string | null;
  supplier_name: string;
  delivery_date: string;
  delivery_window: string;
  status: "pending" | "sent" | "delivered" | "cancelled";
  pdf_url: string | null;
  created_at: string;
  items?: PurchaseOrderItem[];
}

interface PurchaseOrderItem {
  id: string;
  material_name: string;
  quantity: number;
  unit: string;
}

export default function PurchaseOrdersPage() {
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "sent" | "delivered">("all");

  useEffect(() => {
    async function loadData() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase.from("purchase_orders").select("*").order("created_at", { ascending: false });

      if (filter !== "all") {
        query = query.eq("status", filter);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error loading POs:", error);
      } else if (data) {
        // Load items for each PO
        const posWithItems = await Promise.all(
          data.map(async (po: any) => {
            const { data: items } = await supabase
              .from("purchase_order_items")
              .select("*")
              .eq("po_id", po.id);
            return { ...po, items: items || [] };
          })
        );
        setPos(posWithItems);
      }

      setLoading(false);
    }

    loadData();
  }, [filter]);

  const handleMarkDelivered = async (poId: string) => {
    const response = await fetch("/api/po/mark-delivered", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ po_id: poId }),
    });

    if (response.ok) {
      // Reload POs
      const supabase = createClient();
      const { data } = await supabase
        .from("purchase_orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (data) {
        const posWithItems = await Promise.all(
          data.map(async (po: any) => {
            const { data: items } = await supabase
              .from("purchase_order_items")
              .select("*")
              .eq("po_id", po.id);
            return { ...po, items: items || [] };
          })
        );
        setPos(posWithItems);
      }
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "sent":
        return "bg-blue-100 text-blue-800";
      case "delivered":
        return "bg-green-100 text-green-800";
      case "cancelled":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock className="w-4 h-4" />;
      case "sent":
        return <Send className="w-4 h-4" />;
      case "delivered":
        return <CheckCircle className="w-4 h-4" />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sm text-gray-500">Loading purchase orders...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Purchase Orders</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage supplier orders and track deliveries
          </p>
        </div>
        <Link
          href="/purchase-orders/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          Create PO
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(["all", "pending", "sent", "delivered"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              filter === f
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* POs List */}
      <div className="space-y-4">
        {pos.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-sm text-gray-500">No purchase orders found</p>
          </div>
        ) : (
          pos.map((po) => (
            <div
              key={po.id}
              className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <FileText className="w-5 h-5 text-gray-400" />
                    <h3 className="text-lg font-semibold text-gray-900">{po.supplier_name}</h3>
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full flex items-center gap-1 ${getStatusBadge(
                        po.status
                      )}`}
                    >
                      {getStatusIcon(po.status)}
                      {po.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>
                      Delivery: {new Date(po.delivery_date).toLocaleDateString()} (
                      {po.delivery_window})
                    </p>
                    {po.job_id && (
                      <p>
                        Job: <Link href={`/jobs/${po.job_id}`} className="text-blue-600 hover:underline">View Job</Link>
                      </p>
                    )}
                    <p>Created: {new Date(po.created_at).toLocaleDateString()}</p>
                  </div>
                  {po.items && po.items.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Items:</h4>
                      <ul className="space-y-1">
                        {po.items.map((item) => (
                          <li key={item.id} className="text-sm text-gray-600">
                            • {item.quantity} {item.unit} {item.material_name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {po.pdf_url && (
                    <a
                      href={po.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
                      title="View PDF"
                    >
                      <Eye className="w-5 h-5" />
                    </a>
                  )}
                  {po.status !== "delivered" && (
                    <button
                      onClick={() => handleMarkDelivered(po.id)}
                      className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
                    >
                      Mark Delivered
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
































