// Block 22430 — SmartSend Roofing Material Orders & Supplier Tracking v1
// Material Status Tracker Component

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Package, Truck, CheckCircle, AlertCircle, X } from "lucide-react";
import { ReliabilityBadge, ReliabilityStats } from "./supplier-reliability";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface MaterialOrder {
  id: string;
  supplier_id?: string;
  supplier?: {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    reliability_score?: number | null;
    total_orders?: number | null;
    on_time_rate?: number | null;
    avg_delay_days?: number | null;
  };
  materials?: string;
  cost?: number;
  status: string;
  expected_delivery_date?: string;
  actual_delivery_date?: string;
  notes?: string;
  items?: Array<{
    id: string;
    description: string;
    quantity?: number;
    unit?: string;
  }>;
}

interface MaterialStatusProps {
  order: MaterialOrder | null;
  onUpdate?: () => void;
}

// Map legacy statuses to new statuses for display
const mapLegacyStatus = (status: string): string => {
  const mapping: Record<string, string> = {
    'draft': 'ordered',
    'confirmed': 'ordered',
    'on_truck': 'en_route',
    'partial': 'delivered',
    'cancelled': 'canceled',
  };
  return mapping[status] || status;
};

const statusConfig = {
  ordered: {
    label: "Ordered",
    color: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    icon: Package,
    nextStatuses: ["en_route", "delayed", "canceled"],
  },
  en_route: {
    label: "En Route",
    color: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    icon: Truck,
    nextStatuses: ["delivered", "delayed"],
  },
  delivered: {
    label: "Delivered",
    color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    icon: CheckCircle,
    nextStatuses: [],
  },
  delayed: {
    label: "Delayed",
    color: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    icon: AlertCircle,
    nextStatuses: ["en_route", "delivered"],
  },
  canceled: {
    label: "Canceled",
    color: "bg-red-500/20 text-red-400 border-red-500/30",
    icon: X,
    nextStatuses: [],
  },
};

export function MaterialStatus({ order, onUpdate }: MaterialStatusProps) {
  const [updating, setUpdating] = useState(false);
  const [updateSheetOpen, setUpdateSheetOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [updateMessage, setUpdateMessage] = useState<string>("");

  if (!order) {
    return null;
  }

  // Map legacy statuses to new format
  const normalizedStatus = mapLegacyStatus(order.status);
  const currentStatusConfig = statusConfig[normalizedStatus as keyof typeof statusConfig] || statusConfig.ordered;
  const StatusIcon = currentStatusConfig.icon;

  const handleStatusUpdate = async (status: string, message?: string) => {
    setUpdating(true);
    try {
      const response = await fetch("/api/jobs/material-order/update-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          order_id: order.id,
          status,
          message: message || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update status");
      }

      setUpdateSheetOpen(false);
      setSelectedStatus("");
      setUpdateMessage("");
      onUpdate?.();
    } catch (error: any) {
      console.error("Error updating status:", error);
      alert(error.message || "Failed to update status");
    } finally {
      setUpdating(false);
    }
  };

  const handleQuickUpdate = (status: string) => {
    setSelectedStatus(status);
    setUpdateSheetOpen(true);
  };

  const handleSubmitUpdate = () => {
    if (!selectedStatus) return;
    handleStatusUpdate(selectedStatus, updateMessage);
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">
            Material Order Status
          </h3>
          {order.supplier && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-xs text-zinc-300">
                  {order.supplier.name}
                  {order.supplier.phone && ` • ${order.supplier.phone}`}
                </p>
                <ReliabilityBadge supplier={order.supplier} />
              </div>
              <ReliabilityStats supplier={order.supplier} />
            </div>
          )}
        </div>
        <Badge
          className={`text-[10px] px-2 py-0.5 rounded-full border font-medium flex items-center gap-1 ${currentStatusConfig.color}`}
        >
          <StatusIcon className="h-3 w-3" />
          {currentStatusConfig.label}
        </Badge>
      </div>

      {order.materials && (
        <div>
          <p className="text-xs font-semibold mb-1 text-zinc-300">Materials</p>
          <p className="text-xs text-zinc-400">{order.materials}</p>
        </div>
      )}

      {order.items && order.items.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-1 text-zinc-300">Items</p>
          <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 max-h-40 overflow-y-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-2 py-1 text-zinc-500 font-medium">Description</th>
                  <th className="text-right px-2 py-1 text-zinc-500 font-medium">Qty</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id} className="border-b border-zinc-800 last:border-0">
                    <td className="px-2 py-1 text-zinc-300">{item.description}</td>
                    <td className="px-2 py-1 text-right text-zinc-300">
                      {item.quantity} {item.unit || ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {order.cost && (
        <div>
          <p className="text-xs text-zinc-500">Cost</p>
          <p className="text-sm font-semibold text-zinc-200">
            ${order.cost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-zinc-500 text-[11px]">Expected Delivery</p>
          <p className="font-semibold text-zinc-200">
            {order.expected_delivery_date
              ? new Date(order.expected_delivery_date).toLocaleDateString()
              : "Not set"}
          </p>
        </div>
        <div>
          <p className="text-zinc-500 text-[11px]">Actual Delivery</p>
          <p className="font-semibold text-zinc-200">
            {order.actual_delivery_date
              ? new Date(order.actual_delivery_date).toLocaleDateString()
              : "—"}
          </p>
        </div>
      </div>

      {/* Quick Update Buttons */}
      {currentStatusConfig.nextStatuses.length > 0 && (
        <div className="pt-2 border-t border-zinc-800">
          <p className="text-xs font-semibold mb-2 text-zinc-300">Quick Update</p>
          <div className="flex flex-wrap gap-2">
            {currentStatusConfig.nextStatuses.map((status) => {
              const config = statusConfig[status as keyof typeof statusConfig];
              if (!config) return null;
              return (
                <Button
                  key={status}
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickUpdate(status)}
                  disabled={updating}
                  className="text-xs h-7"
                >
                  {updating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <>
                      <config.icon className="h-3 w-3 mr-1" />
                      {config.label}
                    </>
                  )}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* Update Status Sheet */}
      <Sheet open={updateSheetOpen} onOpenChange={setUpdateSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Update Material Order Status</SheetTitle>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>New Status</Label>
              <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/50">
                {selectedStatus && statusConfig[selectedStatus as keyof typeof statusConfig] && (
                  <div className="flex items-center gap-2">
                    {(() => {
                      const Icon = statusConfig[selectedStatus as keyof typeof statusConfig].icon;
                      return <Icon className="h-4 w-4" />;
                    })()}
                    <span className="text-sm font-medium">
                      {statusConfig[selectedStatus as keyof typeof statusConfig].label}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="updateMessage">Message (Optional)</Label>
              <Textarea
                id="updateMessage"
                placeholder="e.g., Driver issue. New ETA: Tomorrow 9 AM"
                value={updateMessage}
                onChange={(e) => setUpdateMessage(e.target.value)}
                rows={3}
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setUpdateSheetOpen(false);
                  setSelectedStatus("");
                  setUpdateMessage("");
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitUpdate}
                disabled={updating || !selectedStatus}
                className="flex-1"
              >
                {updating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update Status"
                )}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

