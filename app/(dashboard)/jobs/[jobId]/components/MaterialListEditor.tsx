// Block 223000 — Material List Generator + Supplier Order Integration
// Material List Editor Component

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Save, Package } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface MaterialListItem {
  id?: string;
  material_id?: string | null;
  description: string;
  quantity: number;
  unit: string;
  waste_factor: number;
  supplier_id?: string | null;
}

interface MaterialListEditorProps {
  jobId: string;
  estimateId?: string;
  materialListId?: string;
  onSave?: () => void;
}

export function MaterialListEditor({
  jobId,
  estimateId,
  materialListId,
  onSave,
}: MaterialListEditorProps) {
  const supabase = createClient();
  const [items, setItems] = useState<MaterialListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);

  // Load existing material list
  useEffect(() => {
    if (materialListId) {
      loadMaterialList();
    }
    loadSuppliers();
    loadMaterials();
  }, [materialListId]);

  const loadMaterialList = async () => {
    if (!materialListId) return;

    setLoading(true);
    try {
      const { data: listItems, error } = await supabase
        .from("material_list_items")
        .select("*")
        .eq("material_list_id", materialListId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setItems(listItems || []);
    } catch (error) {
      console.error("Error loading material list:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadSuppliers = async () => {
    try {
      // Get company_id from estimate if available
      let companyId: string | null = null;
      
      if (estimateId) {
        const { data: estimate } = await supabase
          .from("estimates")
          .select("company_id")
          .eq("id", estimateId)
          .single();
        
        if (estimate) {
          companyId = estimate.company_id;
        }
      }

      // If no estimate, try to get from material list
      if (!companyId && materialListId) {
        const { data: materialList } = await supabase
          .from("material_lists")
          .select("estimate_id, estimates!inner(company_id)")
          .eq("id", materialListId)
          .single();
        
        if (materialList && (materialList as any).estimates) {
          companyId = (materialList as any).estimates.company_id;
        }
      }

      if (companyId) {
        const { data: suppliersData } = await supabase
          .from("suppliers")
          .select("*")
          .eq("company_id", companyId)
          .order("name", { ascending: true });

        setSuppliers(suppliersData || []);
      }
    } catch (error) {
      console.error("Error loading suppliers:", error);
    }
  };

  const loadMaterials = async () => {
    try {
      const { data: materialsData } = await supabase
        .from("materials")
        .select("*")
        .order("name", { ascending: true });

      setMaterials(materialsData || []);
    } catch (error) {
      console.error("Error loading materials:", error);
    }
  };

  const handleGenerateFromEstimate = async () => {
    if (!estimateId) {
      alert("No estimate ID provided");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/materials/list/from-estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          estimate_id: estimateId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate material list");
      }

      const data = await response.json();
      if (data.material_list_id) {
        // Reload the list
        window.location.reload(); // Simple reload for now
      }
    } catch (error: any) {
      console.error("Error generating from estimate:", error);
      alert(error.message || "Failed to generate material list");
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        description: "",
        quantity: 1,
        unit: "each",
        waste_factor: 10,
        supplier_id: null,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleUpdateItem = (index: number, field: keyof MaterialListItem, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const handleSave = async () => {
    if (!materialListId) {
      alert("No material list ID");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/materials/list/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          material_list_id: materialListId,
          items: items,
          status: "finalized",
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save material list");
      }

      if (onSave) onSave();
      alert("Material list saved successfully");
    } catch (error: any) {
      console.error("Error saving material list:", error);
      alert(error.message || "Failed to save material list");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !materialListId) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-sm text-zinc-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-zinc-400" />
          <h3 className="text-sm font-semibold text-zinc-50">Material List</h3>
        </div>
        <div className="flex gap-2">
          {!materialListId && estimateId && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerateFromEstimate}
              disabled={loading}
              className="text-xs"
            >
              Generate from Estimate
            </Button>
          )}
          {materialListId && (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="text-xs"
            >
              <Save className="h-3 w-3 mr-1" />
              {saving ? "Saving..." : "Finalize List"}
            </Button>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-8 text-sm text-zinc-400">
          {!materialListId && estimateId ? (
            <div className="space-y-2">
              <p>No material list created yet.</p>
              <Button
                size="sm"
                variant="outline"
                onClick={handleGenerateFromEstimate}
                disabled={loading}
              >
                Generate from Estimate
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p>No items in material list.</p>
              <Button size="sm" variant="outline" onClick={handleAddItem}>
                <Plus className="h-3 w-3 mr-1" />
                Add Item
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-7 gap-2 text-xs font-medium text-zinc-500 pb-2 border-b border-zinc-800">
            <div>Material</div>
            <div>Category</div>
            <div>Supplier</div>
            <div>Quantity</div>
            <div>Unit</div>
            <div>Waste %</div>
            <div className="text-right">Actions</div>
          </div>

          {items.map((item, index) => (
            <div
              key={index}
              className="grid grid-cols-7 gap-2 items-center text-sm"
            >
              <Input
                value={item.description}
                onChange={(e) =>
                  handleUpdateItem(index, "description", e.target.value)
                }
                placeholder="Material name"
                className="h-8 text-xs"
              />
              <div className="text-zinc-400 text-xs">
                {materials.find((m) => m.id === item.material_id)?.category || "-"}
              </div>
              <select
                value={item.supplier_id || ""}
                onChange={(e) =>
                  handleUpdateItem(index, "supplier_id", e.target.value || null)
                }
                className="h-8 px-2 rounded border border-zinc-700 bg-zinc-900 text-xs text-zinc-50"
              >
                <option value="">Select supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
              <Input
                type="number"
                value={item.quantity}
                onChange={(e) =>
                  handleUpdateItem(index, "quantity", parseFloat(e.target.value) || 0)
                }
                className="h-8 text-xs"
              />
              <Input
                value={item.unit}
                onChange={(e) =>
                  handleUpdateItem(index, "unit", e.target.value)
                }
                placeholder="unit"
                className="h-8 text-xs"
              />
              <Input
                type="number"
                value={item.waste_factor}
                onChange={(e) =>
                  handleUpdateItem(index, "waste_factor", parseFloat(e.target.value) || 0)
                }
                className="h-8 text-xs"
              />
              <div className="text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRemoveItem(index)}
                  className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}

          <Button
            size="sm"
            variant="outline"
            onClick={handleAddItem}
            className="w-full text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Line Item
          </Button>
        </div>
      )}
    </div>
  );
}

























