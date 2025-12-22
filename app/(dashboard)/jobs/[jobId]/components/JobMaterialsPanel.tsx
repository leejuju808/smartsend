// Block 22430 — SmartSend Roofing Material Orders & Supplier Tracking v1
// Job Materials Panel Component
// Displays material order, supplier info, delivery status, and items
// Now includes Add Order button and MaterialStatus tracker

"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { AddMaterialOrder } from "./AddMaterialOrder";
import { MaterialStatus } from "./MaterialStatus";
import { SupplierStatusPanel } from "./SupplierStatusPanel";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface MaterialOrderItem {
  id: string;
  description: string;
  sku?: string;
  quantity: number;
  unit?: string;
  unit_price?: number;
  total_price?: number;
}

interface MaterialDelivery {
  id: string;
  delivery_date: string;
  status: string;
  delivered_by?: string;
  notes?: string;
}

interface Supplier {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}

interface MaterialOrder {
  id: string;
  po_number?: string;
  status: string;
  expected_delivery_date?: string;
  actual_delivery_date?: string;
  notes?: string;
  materials?: string;
  cost?: number;
  items?: MaterialOrderItem[];
  supplier?: Supplier;
  supplier_id?: string;
}

interface MaterialsData {
  order: MaterialOrder | null;
  deliveries: MaterialDelivery[];
  supplier: Supplier | null;
}

export function JobMaterialsPanel({ jobId }: { jobId: string }) {
  const [addOrderOpen, setAddOrderOpen] = useState(false);
  const { data, error, mutate } = useSWR<MaterialsData>(
    `/api/jobs/${jobId}/materials`,
    fetcher
  );

  const handleSuccess = () => {
    mutate(); // Refresh data
  };

  if (!data && !error) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-xs text-zinc-400">Loading materials…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-xs text-red-400">
          Error: {error instanceof Error ? error.message : "Failed to load materials"}
        </p>
      </div>
    );
  }

  const { order, deliveries, supplier } = data || { order: null, deliveries: [], supplier: null };

  // If no order, show add button
  if (!order) {
    return (
      <>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Materials
            </h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAddOrderOpen(true)}
              className="h-7 text-xs"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Order
            </Button>
          </div>
          <p className="text-xs text-zinc-400">
            No material order linked to this job yet.
          </p>
        </div>
        <AddMaterialOrder
          jobId={jobId}
          open={addOrderOpen}
          onOpenChange={setAddOrderOpen}
          onSuccess={handleSuccess}
        />
      </>
    );
  }

  // Merge supplier into order for MaterialStatus component
  const orderWithSupplier = {
    ...order,
    supplier: supplier || undefined,
  };

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Materials
          </h3>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAddOrderOpen(true)}
            className="h-7 text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Order
          </Button>
        </div>
        <MaterialStatus order={orderWithSupplier} onUpdate={handleSuccess} />
        {order.id && (
          <SupplierStatusPanel materialOrderId={order.id} jobId={jobId} />
        )}
      </div>
      <AddMaterialOrder
        jobId={jobId}
        open={addOrderOpen}
        onOpenChange={setAddOrderOpen}
        onSuccess={handleSuccess}
      />
    </>
  );
}

