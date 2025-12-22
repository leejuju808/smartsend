// Block 24300 — SmartSend Roofing Material Orders & Supplier Tracking v1
// Material Shortage Alert Component
// Shows AI-detected material shortages and allows creating supplemental orders

"use client";

import { useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { AlertCircle, Plus, X } from "lucide-react";
import { AddMaterialOrder } from "./AddMaterialOrder";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ShortageAlert {
  id: string;
  detected_from: string;
  detected_text: string;
  shortage_type: string;
  item_description: string;
  quantity_needed?: number;
  ai_confidence: number;
  status: string;
  supplemental_order_id?: string;
}

interface MaterialShortageAlertProps {
  jobId: string;
}

export function MaterialShortageAlert({ jobId }: MaterialShortageAlertProps) {
  const [createOrderOpen, setCreateOrderOpen] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<ShortageAlert | null>(null);

  const { data, error, mutate } = useSWR<{ alerts: ShortageAlert[] }>(
    `/api/jobs/${jobId}/materials/shortage-alerts`,
    fetcher
  );

  const handleCreateOrder = (alert: ShortageAlert) => {
    setSelectedAlert(alert);
    setCreateOrderOpen(true);
  };

  const handleDismiss = async (alertId: string) => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/materials/shortage-alerts/${alertId}/dismiss`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to dismiss alert");
      }

      mutate();
    } catch (error: any) {
      console.error("Error dismissing alert:", error);
      alert(error.message || "Failed to dismiss alert");
    }
  };

  if (error || !data || data.alerts.length === 0) {
    return null;
  }

  const activeAlerts = data.alerts.filter((a) => a.status === "detected");

  if (activeAlerts.length === 0) {
    return null;
  }

  return (
    <>
      <div className="rounded-2xl border border-yellow-800 bg-yellow-950/20 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-yellow-400" />
          <h3 className="text-xs font-semibold text-yellow-400">
            Material Shortage Detected
          </h3>
        </div>

        {activeAlerts.map((alert) => (
          <div
            key={alert.id}
            className="bg-zinc-900/50 rounded-lg p-3 space-y-2"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="text-xs font-semibold text-zinc-300">
                  {alert.item_description}
                </div>
                {alert.quantity_needed && (
                  <div className="text-xs text-zinc-500 mt-1">
                    Quantity needed: {alert.quantity_needed}
                  </div>
                )}
                <div className="text-xs text-zinc-500 mt-1">
                  Detected from: "{alert.detected_text}"
                </div>
                <div className="text-xs text-zinc-600 mt-1">
                  Confidence: {alert.ai_confidence}%
                </div>
              </div>
              <button
                onClick={() => handleDismiss(alert.id)}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => handleCreateOrder(alert)}
              className="w-full text-xs border-yellow-600 text-yellow-400 hover:bg-yellow-900/20"
            >
              <Plus className="h-3 w-3 mr-2" />
              Create Supplemental Order
            </Button>
          </div>
        ))}
      </div>

      {createOrderOpen && selectedAlert && (
        <AddMaterialOrder
          jobId={jobId}
          open={createOrderOpen}
          onOpenChange={setCreateOrderOpen}
          onSuccess={() => {
            mutate();
            setCreateOrderOpen(false);
          }}
          initialNotes={`Supplemental order for: ${selectedAlert.item_description}\n\nDetected shortage: ${selectedAlert.detected_text}`}
        />
      )}
    </>
  );
}






































