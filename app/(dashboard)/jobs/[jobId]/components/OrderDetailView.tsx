// Block 223000 — Material List Generator + Supplier Order Integration
// Order Detail View Component

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { X, Send, CheckCircle2, Clock, Truck, Package } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface OrderItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
}

interface SupplierOrder {
  id: string;
  po_number?: string;
  status: string;
  requested_delivery_date?: string;
  requested_delivery_window?: string;
  drop_location?: string;
  notes?: string;
  supplier: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
  };
  items: OrderItem[];
}

interface OrderDetailViewProps {
  orderId: string;
  onClose: () => void;
  onUpdate?: () => void;
}

export function OrderDetailView({
  orderId,
  onClose,
  onUpdate,
}: OrderDetailViewProps) {
  const supabase = createClient();
  const [order, setOrder] = useState<SupplierOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    po_number: "",
    requested_delivery_date: "",
    requested_delivery_window: "Any",
    drop_location: "",
    notes: "",
  });

  useEffect(() => {
    loadOrder();
  }, [orderId]);

  const loadOrder = async () => {
    setLoading(true);
    try {
      const { data: orderData, error } = await supabase
        .from("supplier_orders")
        .select(`
          id,
          po_number,
          status,
          requested_delivery_date,
          requested_delivery_window,
          drop_location,
          notes,
          suppliers!inner(id, name, email, phone)
        `)
        .eq("id", orderId)
        .single();

      if (error) throw error;

      const { data: itemsData } = await supabase
        .from("supplier_order_items")
        .select("*")
        .eq("supplier_order_id", orderId);

      const formattedOrder: SupplierOrder = {
        id: orderData.id,
        po_number: orderData.po_number,
        status: orderData.status,
        requested_delivery_date: orderData.requested_delivery_date,
        requested_delivery_window: orderData.requested_delivery_window,
        drop_location: orderData.drop_location,
        notes: orderData.notes,
        supplier: (orderData as any).suppliers,
        items: itemsData || [],
      };

      setOrder(formattedOrder);
      setFormData({
        po_number: formattedOrder.po_number || "",
        requested_delivery_date: formattedOrder.requested_delivery_date || "",
        requested_delivery_window: formattedOrder.requested_delivery_window || "Any",
        drop_location: formattedOrder.drop_location || "",
        notes: formattedOrder.notes || "",
      });
    } catch (error) {
      console.error("Error loading order:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkSent = async () => {
    if (!order) return;

    setSaving(true);
    try {
      const response = await fetch("/api/suppliers/orders/mark-sent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_order_id: orderId,
          po_number: formData.po_number || undefined,
          requested_delivery_date: formData.requested_delivery_date || undefined,
          requested_delivery_window: formData.requested_delivery_window || undefined,
          drop_location: formData.drop_location || undefined,
          notes: formData.notes || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to mark order as sent");
      }

      if (onUpdate) onUpdate();
      loadOrder();
      alert("Order marked as sent");
    } catch (error: any) {
      console.error("Error marking order as sent:", error);
      alert(error.message || "Failed to mark order as sent");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (status: string) => {
    if (!order) return;

    setSaving(true);
    try {
      const response = await fetch("/api/suppliers/orders/delivery-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier_order_id: orderId,
          status: status,
          notes: `Status updated to ${status}`,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update status");
      }

      if (onUpdate) onUpdate();
      loadOrder();
    } catch (error: any) {
      console.error("Error updating status:", error);
      alert(error.message || "Failed to update status");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-sm text-zinc-400">Loading order...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-sm text-red-400">Order not found</p>
      </div>
    );
  }

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

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-50">Order Details</h3>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClose}
          className="h-6 w-6 p-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Supplier Info */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-zinc-50">{order.supplier.name}</h4>
          {getStatusBadge(order.status)}
        </div>
        {order.supplier.email && (
          <p className="text-xs text-zinc-400">Email: {order.supplier.email}</p>
        )}
        {order.supplier.phone && (
          <p className="text-xs text-zinc-400">Phone: {order.supplier.phone}</p>
        )}
      </div>

      {/* Order Form */}
      {order.status === "draft" && (
        <div className="space-y-3 pt-4 border-t border-zinc-800">
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">PO Number</label>
            <Input
              value={formData.po_number}
              onChange={(e) => setFormData({ ...formData, po_number: e.target.value })}
              placeholder="PO-12345"
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Requested Delivery Date</label>
            <Input
              type="date"
              value={formData.requested_delivery_date}
              onChange={(e) => setFormData({ ...formData, requested_delivery_date: e.target.value })}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Delivery Window</label>
            <select
              value={formData.requested_delivery_window}
              onChange={(e) => setFormData({ ...formData, requested_delivery_window: e.target.value })}
              className="h-8 w-full px-2 rounded border border-zinc-700 bg-zinc-900 text-xs text-zinc-50"
            >
              <option value="Any">Any</option>
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Drop Location</label>
            <Input
              value={formData.drop_location}
              onChange={(e) => setFormData({ ...formData, drop_location: e.target.value })}
              placeholder="Driveway front left"
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes..."
              className="w-full px-3 py-2 rounded border border-zinc-700 bg-zinc-900 text-xs text-zinc-50"
              rows={3}
            />
          </div>
          <Button
            size="sm"
            onClick={handleMarkSent}
            disabled={saving}
            className="w-full text-xs"
          >
            <Send className="h-3 w-3 mr-1" />
            {saving ? "Sending..." : "Mark as Sent"}
          </Button>
        </div>
      )}

      {/* Status Updates */}
      {order.status !== "draft" && order.status !== "delivered" && (
        <div className="space-y-2 pt-4 border-t border-zinc-800">
          <p className="text-xs text-zinc-400 mb-2">Update Status:</p>
          <div className="flex gap-2">
            {order.status === "sent" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleUpdateStatus("confirmed")}
                disabled={saving}
                className="text-xs flex-1"
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Mark Confirmed
              </Button>
            )}
            {(order.status === "confirmed" || order.status === "sent") && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleUpdateStatus("scheduled")}
                disabled={saving}
                className="text-xs flex-1"
              >
                <Clock className="h-3 w-3 mr-1" />
                Mark Scheduled
              </Button>
            )}
            {order.status === "scheduled" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleUpdateStatus("delivered")}
                disabled={saving}
                className="text-xs flex-1"
              >
                <Truck className="h-3 w-3 mr-1" />
                Mark Delivered
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Order Items */}
      <div className="pt-4 border-t border-zinc-800">
        <h4 className="text-xs font-semibold text-zinc-400 mb-3">Line Items</h4>
        <div className="space-y-2">
          {order.items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between text-xs py-2 px-3 bg-zinc-900 rounded"
            >
              <span className="text-zinc-300">{item.description}</span>
              <span className="text-zinc-400">
                {item.quantity} {item.unit}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

























