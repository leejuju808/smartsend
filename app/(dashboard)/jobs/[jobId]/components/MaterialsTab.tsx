// Block 24300 — SmartSend Roofing Material Orders & Supplier Tracking v1
// Materials Tab Component
// Full Materials tab for job detail page with takeoff, orders, delivery tracking

"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Plus, Send, CheckCircle2, AlertCircle, Package } from "lucide-react";
import { MaterialTakeoffForm } from "./MaterialTakeoffForm";
import { AddMaterialOrder } from "./AddMaterialOrder";
import { MaterialStatus } from "./MaterialStatus";
import { MaterialShortageAlert } from "./MaterialShortageAlert";
import { createClient } from "@/lib/supabase/client";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface MaterialOrder {
  id: string;
  po_number?: string;
  status: string;
  expected_delivery_date?: string;
  actual_delivery_date?: string;
  delivery_address?: string;
  delivery_time?: string;
  on_site_placement_instructions?: string;
  crew_confirmed?: boolean;
  supplier_confirmed?: boolean;
  issue_reported?: boolean;
  issue_description?: string;
  materials_approved_for_build?: boolean;
  notes?: string;
  total?: number;
  labor_estimate?: number;
  estimated_profit?: number;
  estimated_profit_margin?: number;
  supplier?: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
  };
  items?: Array<{
    id: string;
    description: string;
    quantity: number;
    unit?: string;
  }>;
}

interface PurchaseOrder {
  id: string;
  po_number: string;
  sent_to_email?: string;
  sent_at?: string;
  confirmed_at?: string;
  confirmation_email_received?: boolean;
}

interface MaterialsData {
  takeoff: any;
  order: MaterialOrder | null;
  purchaseOrder: PurchaseOrder | null;
  deliveries: any[];
  supplier: any;
}

interface MaterialsTabProps {
  jobId: string;
}

export function MaterialsTab({ jobId }: MaterialsTabProps) {
  const supabase = createClient();
  const [addOrderOpen, setAddOrderOpen] = useState(false);
  const [sendingPO, setSendingPO] = useState(false);

  const { data, error, mutate } = useSWR<MaterialsData>(
    `/api/jobs/${jobId}/materials`,
    fetcher
  );

  const handleSuccess = () => {
    mutate();
  };

  const handleSendPO = async () => {
    if (!data?.order) return;

    setSendingPO(true);
    try {
      const response = await fetch(`/api/jobs/${jobId}/materials/send-po`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          material_order_id: data.order.id,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to send PO");
      }

      mutate();
    } catch (error: any) {
      console.error("Error sending PO:", error);
      alert(error.message || "Failed to send PO");
    } finally {
      setSendingPO(false);
    }
  };

  const handleCrewConfirm = async () => {
    if (!data?.order) return;

    try {
      const response = await fetch(`/api/jobs/${jobId}/materials/crew-confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          material_order_id: data.order.id,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to confirm materials");
      }

      mutate();
    } catch (error: any) {
      console.error("Error confirming materials:", error);
      alert(error.message || "Failed to confirm materials");
    }
  };

  const handleApproveForBuild = async () => {
    if (!data?.order) return;

    try {
      const response = await fetch(`/api/jobs/${jobId}/materials/approve-build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          material_order_id: data.order.id,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to approve materials");
      }

      mutate();
    } catch (error: any) {
      console.error("Error approving materials:", error);
      alert(error.message || "Failed to approve materials");
    }
  };

  if (error) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-xs text-red-400">
          Error: {error instanceof Error ? error.message : "Failed to load materials"}
        </p>
      </div>
    );
  }

  const { takeoff, order, purchaseOrder, deliveries, supplier } = data || {};

  return (
    <div className="space-y-6">
      {/* Material Shortage Alerts */}
      <MaterialShortageAlert jobId={jobId} />

      {/* Material Takeoff */}
      <MaterialTakeoffForm jobId={jobId} onSave={handleSuccess} />

      {/* Material Order Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-50">Order Status</h3>
          {!order && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAddOrderOpen(true)}
              className="h-8 text-xs"
            >
              <Plus className="h-3 w-3 mr-1" />
              Create Order
            </Button>
          )}
        </div>

        {order ? (
          <div className="space-y-4">
            {/* Order Status Card */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
              <MaterialStatus order={{ ...order, supplier }} onUpdate={handleSuccess} />

              {/* PO Actions */}
              {order.status !== "cancelled" && order.status !== "canceled" && (
                <div className="mt-4 pt-4 border-t border-zinc-800 space-y-2">
                  {!purchaseOrder && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSendPO}
                      disabled={sendingPO || !supplier?.email}
                      className="w-full text-xs"
                    >
                      <Send className="h-3 w-3 mr-2" />
                      {sendingPO ? "Sending..." : "Send PO to Supplier"}
                    </Button>
                  )}

                  {purchaseOrder && !purchaseOrder.confirmation_email_received && (
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <Package className="h-4 w-4" />
                      <span>PO sent to {purchaseOrder.sent_to_email} — waiting for confirmation</span>
                    </div>
                  )}

                  {purchaseOrder?.confirmation_email_received && (
                    <div className="flex items-center gap-2 text-xs text-green-400">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>PO confirmed by supplier</span>
                    </div>
                  )}
                </div>
              )}

              {/* Delivery Management */}
              {order.status === "delivered" || order.status === "scheduled_for_delivery" ? (
                <div className="mt-4 pt-4 border-t border-zinc-800 space-y-3">
                  {order.delivery_address && (
                    <div className="text-xs">
                      <span className="text-zinc-500">Delivery Address: </span>
                      <span className="text-zinc-300">{order.delivery_address}</span>
                    </div>
                  )}

                  {order.delivery_time && (
                    <div className="text-xs">
                      <span className="text-zinc-500">Delivery Time: </span>
                      <span className="text-zinc-300">{order.delivery_time}</span>
                    </div>
                  )}

                  {order.on_site_placement_instructions && (
                    <div className="text-xs">
                      <span className="text-zinc-500">Placement Instructions: </span>
                      <span className="text-zinc-300">{order.on_site_placement_instructions}</span>
                    </div>
                  )}

                  {order.issue_reported && (
                    <div className="flex items-start gap-2 p-2 bg-red-950/20 border border-red-800 rounded-lg">
                      <AlertCircle className="h-4 w-4 text-red-400 mt-0.5" />
                      <div className="text-xs">
                        <div className="text-red-400 font-semibold">Issue Reported</div>
                        {order.issue_description && (
                          <div className="text-zinc-300 mt-1">{order.issue_description}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {!order.crew_confirmed && order.status === "delivered" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCrewConfirm}
                      className="w-full text-xs"
                    >
                      <CheckCircle2 className="h-3 w-3 mr-2" />
                      Confirm Materials Received & Placed
                    </Button>
                  )}

                  {order.crew_confirmed && !order.materials_approved_for_build && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-green-400">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Crew confirmed materials are ready</span>
                      </div>
                      <Button
                        size="sm"
                        onClick={handleApproveForBuild}
                        className="w-full text-xs bg-green-600 hover:bg-green-700"
                      >
                        Approve Materials for Build
                      </Button>
                    </div>
                  )}

                  {order.materials_approved_for_build && (
                    <div className="flex items-center gap-2 text-xs text-green-400">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Materials approved for build — Ready to install</span>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Cost & Profit Tracking */}
            {(order.total || order.estimated_profit !== null) && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                <h4 className="text-xs font-semibold text-zinc-400 mb-3">Cost & Profit</h4>
                <div className="space-y-2 text-xs">
                  {order.total && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Material Cost:</span>
                      <span className="text-zinc-300">${order.total.toLocaleString()}</span>
                    </div>
                  )}
                  {order.labor_estimate && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Labor Estimate:</span>
                      <span className="text-zinc-300">${order.labor_estimate.toLocaleString()}</span>
                    </div>
                  )}
                  {order.estimated_profit !== null && (
                    <>
                      <div className="flex justify-between pt-2 border-t border-zinc-800">
                        <span className="text-zinc-500">Estimated Profit:</span>
                        <span className={`font-semibold ${
                          order.estimated_profit >= 0 ? "text-green-400" : "text-red-400"
                        }`}>
                          ${order.estimated_profit.toLocaleString()}
                        </span>
                      </div>
                      {order.estimated_profit_margin !== null && (
                        <div className="flex justify-between">
                          <span className="text-zinc-500">Profit Margin:</span>
                          <span className={`font-semibold ${
                            order.estimated_profit_margin >= 0 ? "text-green-400" : "text-red-400"
                          }`}>
                            {order.estimated_profit_margin.toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-center">
            <p className="text-xs text-zinc-400 mb-3">
              No material order created yet. Create an order to track supplier delivery.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAddOrderOpen(true)}
              className="text-xs"
            >
              <Plus className="h-3 w-3 mr-1" />
              Create Order
            </Button>
          </div>
        )}
      </div>

      {/* Add Order Modal */}
      <AddMaterialOrder
        jobId={jobId}
        open={addOrderOpen}
        onOpenChange={setAddOrderOpen}
        onSuccess={handleSuccess}
      />
    </div>
  );
}

