// Block 223000 — Material List Generator + Supplier Order Integration
// Supplier Orders View Component

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Package, Send, CheckCircle2, Clock, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { OrderDetailView } from "./OrderDetailView";

interface SupplierOrder {
  id: string;
  po_number?: string;
  status: string;
  requested_delivery_date?: string;
  requested_delivery_window?: string;
  drop_location?: string;
  supplier: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
  };
}

interface SupplierOrdersViewProps {
  jobId: string;
  materialListId?: string;
  onOrderUpdate?: () => void;
}

export function SupplierOrdersView({
  jobId,
  materialListId,
  onOrderUpdate,
}: SupplierOrdersViewProps) {
  const supabase = createClient();
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  useEffect(() => {
    loadOrders();
  }, [jobId, materialListId]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const { data: ordersData, error } = await supabase
        .from("supplier_orders")
        .select(`
          id,
          po_number,
          status,
          requested_delivery_date,
          requested_delivery_window,
          drop_location,
          suppliers!inner(id, name, email, phone)
        `)
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const formattedOrders = (ordersData || []).map((order: any) => ({
        id: order.id,
        po_number: order.po_number,
        status: order.status,
        requested_delivery_date: order.requested_delivery_date,
        requested_delivery_window: order.requested_delivery_window,
        drop_location: order.drop_location,
        supplier: order.suppliers,
      }));

      setOrders(formattedOrders);
    } catch (error) {
      console.error("Error loading supplier orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrders = async () => {
    if (!materialListId) {
      alert("No material list ID. Please create a material list first.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/suppliers/orders/create-from-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          material_list_id: materialListId,
          grouping_rule: "by_supplier",
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create supplier orders");
      }

      const data = await response.json();
      if (data.supplier_order_ids && data.supplier_order_ids.length > 0) {
        loadOrders();
        if (onOrderUpdate) onOrderUpdate();
      } else {
        alert("No supplier orders created. Please assign suppliers to material list items first.");
      }
    } catch (error: any) {
      console.error("Error creating supplier orders:", error);
      alert(error.message || "Failed to create supplier orders");
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: any; icon: any }> = {
      draft: { label: "Draft", variant: "secondary", icon: Package },
      sent: { label: "Sent", variant: "default", icon: Send },
      confirmed: { label: "Confirmed", variant: "default", icon: CheckCircle2 },
      scheduled: { label: "Scheduled", variant: "default", icon: Clock },
      delivered: { label: "Delivered", variant: "default", icon: Truck },
    };

    const config = statusConfig[status] || statusConfig.draft;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="text-xs">
        <Icon className="h-3 w-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  if (loading && orders.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-sm text-zinc-400">Loading orders...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-50">Supplier Orders</h3>
        {orders.length === 0 && materialListId && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleCreateOrders}
            disabled={loading}
            className="text-xs"
          >
            <Package className="h-3 w-3 mr-1" />
            Create Orders from Material List
          </Button>
        )}
      </div>

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-center">
          <p className="text-sm text-zinc-400 mb-3">
            No supplier orders created yet.
          </p>
          {materialListId ? (
            <Button
              size="sm"
              variant="outline"
              onClick={handleCreateOrders}
              disabled={loading}
            >
              Create Orders from Material List
            </Button>
          ) : (
            <p className="text-xs text-zinc-500">
              Create a material list first, then assign suppliers to items.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div
              key={order.id}
              className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 cursor-pointer hover:border-zinc-700 transition-colors"
              onClick={() => setSelectedOrderId(order.id)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="text-sm font-semibold text-zinc-50">
                      {order.supplier.name}
                    </h4>
                    {getStatusBadge(order.status)}
                  </div>
                  {order.po_number && (
                    <p className="text-xs text-zinc-400 mb-1">
                      PO: {order.po_number}
                    </p>
                  )}
                  {order.requested_delivery_date && (
                    <p className="text-xs text-zinc-400">
                      Delivery: {new Date(order.requested_delivery_date).toLocaleDateString()}
                      {order.requested_delivery_window && ` (${order.requested_delivery_window})`}
                    </p>
                  )}
                  {order.drop_location && (
                    <p className="text-xs text-zinc-400 mt-1">
                      Drop: {order.drop_location}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedOrderId(order.id);
                  }}
                  className="text-xs"
                >
                  View Order
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedOrderId && (
        <OrderDetailView
          orderId={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
          onUpdate={() => {
            loadOrders();
            if (onOrderUpdate) onOrderUpdate();
          }}
        />
      )}
    </div>
  );
}

























