"use client";

// Block 48000 — SmartSend Roofing "Inventory + Supplier Purchase Order System" v1
// Material Requirement Drawer Component
// Shows material requirements for a job and allows generating PO

import { useState, useEffect } from "react";
import { Package, FileText, Calendar, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface MaterialRequirement {
  material_name: string;
  quantity: number;
  unit: string;
}

interface MaterialRequirementDrawerProps {
  jobId: string;
  open: boolean;
  onClose: () => void;
  onPOCreated?: () => void;
}

export function MaterialRequirementDrawer({
  jobId,
  open,
  onClose,
  onPOCreated,
}: MaterialRequirementDrawerProps) {
  const [requirements, setRequirements] = useState<MaterialRequirement[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPODialog, setShowPODialog] = useState(false);
  const [poForm, setPoForm] = useState({
    supplier_name: "",
    delivery_date: "",
    delivery_window: "anytime",
  });

  useEffect(() => {
    if (open && jobId) {
      loadMaterialRequirements();
    }
  }, [open, jobId]);

  async function loadMaterialRequirements() {
    const supabase = createClient();
    
    // Try to get material requirements from job_materials or estimated_materials
    const { data: job } = await supabase
      .from("jobs")
      .select("estimated_materials")
      .eq("id", jobId)
      .single();

    if (job?.estimated_materials) {
      // Convert JSONB to array format
      const materials: MaterialRequirement[] = [];
      for (const [key, value] of Object.entries(job.estimated_materials as any)) {
        if (key !== "notes" && typeof value === "number") {
          materials.push({
            material_name: key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
            quantity: value,
            unit: key.includes("bundle") ? "bundle" : key.includes("roll") ? "roll" : "each",
          });
        }
      }
      setRequirements(materials);
    } else {
      // Default requirements if none specified
      setRequirements([
        { material_name: "Bundles (Shingles)", quantity: 28, unit: "bundle" },
        { material_name: "Ridge Caps", quantity: 6, unit: "each" },
        { material_name: "Underlayment Rolls", quantity: 3, unit: "roll" },
        { material_name: "Ice/Water Shield", quantity: 2, unit: "roll" },
        { material_name: "Nails", quantity: 50, unit: "lbs" },
      ]);
    }
  }

  async function handleGeneratePO() {
    if (!poForm.supplier_name || !poForm.delivery_date) {
      alert("Please fill in supplier name and delivery date");
      return;
    }

    setLoading(true);
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const response = await fetch(`${supabaseUrl}/functions/v1/po-generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          job_id: jobId,
          supplier_name: poForm.supplier_name,
          delivery_date: poForm.delivery_date,
          delivery_window: poForm.delivery_window,
          items: requirements,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create PO");
      }

      alert("Purchase order created successfully!");
      setShowPODialog(false);
      setPoForm({ supplier_name: "", delivery_date: "", delivery_window: "anytime" });
      onPOCreated?.();
      onClose();
    } catch (error: any) {
      console.error("Error creating PO:", error);
      alert("Failed to create PO: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Material Requirements</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-6">
            <p className="text-sm text-gray-600 mb-4">
              This job requires the following materials:
            </p>

            <div className="space-y-3">
              {requirements.map((req, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Package className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-900">
                      {req.material_name}
                    </span>
                  </div>
                  <span className="text-sm text-gray-600">
                    {req.quantity} {req.unit}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => setShowPODialog(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            <FileText className="w-5 h-5" />
            Generate Purchase Order
          </button>
        </div>
      </div>

      {/* PO Dialog */}
      {showPODialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Create Purchase Order</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Supplier Name
                </label>
                <input
                  type="text"
                  value={poForm.supplier_name}
                  onChange={(e) =>
                    setPoForm({ ...poForm, supplier_name: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., ABC Roofing Supply"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Delivery Date
                </label>
                <input
                  type="date"
                  value={poForm.delivery_date}
                  onChange={(e) =>
                    setPoForm({ ...poForm, delivery_date: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Delivery Window
                </label>
                <select
                  value={poForm.delivery_window}
                  onChange={(e) =>
                    setPoForm({ ...poForm, delivery_window: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="anytime">Anytime</option>
                  <option value="morning">Morning</option>
                  <option value="afternoon">Afternoon</option>
                  <option value="day_before">Day Before Job</option>
                  <option value="morning_of">Morning of Job</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={handleGeneratePO}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create PO"}
              </button>
              <button
                onClick={() => setShowPODialog(false)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
































