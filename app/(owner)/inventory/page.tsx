"use client";

// Block 48000 — SmartSend Roofing "Inventory + Supplier Purchase Order System" v1
// Inventory Dashboard Page
// Shows material inventory with status (OK / Low / Out)

import { useEffect, useState } from "react";
import { Package, Plus, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

interface Material {
  id: string;
  name: string;
  quantity: number;
  min_quantity: number;
  unit: string;
  status: "ok" | "low" | "out";
}

export default function InventoryDashboardPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    unit: "bundle",
    quantity: "",
    min_quantity: "",
  });
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get company_id (simplified - in production, get from user's workspace/company)
      const { data: companies } = await supabase
        .from("companies")
        .select("id")
        .limit(1)
        .single();

      if (companies) {
        setCompanyId(companies.id);
      }

      // Load materials
      const { data: materialsData, error } = await supabase
        .from("materials")
        .select("*")
        .order("name");

      if (error) {
        console.error("Error loading materials:", error);
      } else if (materialsData) {
        const materialsWithStatus = materialsData.map((m: any) => ({
          ...m,
          status: m.quantity <= 0 ? "out" : m.quantity < m.min_quantity ? "low" : "ok",
        }));
        setMaterials(materialsWithStatus);
      }

      setLoading(false);
    }

    loadData();
  }, []);

  const handleAddMaterial = async () => {
    if (!formData.name || !formData.quantity) {
      alert("Please fill in name and quantity");
      return;
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from("materials")
      .insert({
        name: formData.name,
        unit: formData.unit,
        quantity: parseFloat(formData.quantity),
        min_quantity: parseFloat(formData.min_quantity) || 0,
        company_id: companyId,
      })
      .select()
      .single();

    if (error) {
      console.error("Error adding material:", error);
      alert("Failed to add material: " + error.message);
    } else {
      setMaterials((prev) => [
        ...prev,
        {
          ...data,
          status: data.quantity <= 0 ? "out" : data.quantity < data.min_quantity ? "low" : "ok",
        },
      ]);
      setFormData({ name: "", unit: "bundle", quantity: "", min_quantity: "" });
      setShowAddForm(false);
    }
  };

  const handleAdjustQuantity = async (materialId: string, adjustment: number) => {
    const supabase = createClient();
    const material = materials.find((m) => m.id === materialId);
    if (!material) return;

    // Create adjustment
    const { error } = await supabase.from("material_adjustments").insert({
      material_id: materialId,
      adjustment: adjustment,
      reason: "Manual adjustment",
    });

    if (error) {
      console.error("Error adjusting material:", error);
      alert("Failed to adjust material");
    } else {
      // Reload materials
      const { data: updated } = await supabase
        .from("materials")
        .select("*")
        .eq("id", materialId)
        .single();

      if (updated) {
        setMaterials((prev) =>
          prev.map((m) =>
            m.id === materialId
              ? {
                  ...updated,
                  status:
                    updated.quantity <= 0
                      ? "out"
                      : updated.quantity < updated.min_quantity
                      ? "low"
                      : "ok",
                }
              : m
          )
        );
      }
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "ok":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "low":
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case "out":
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ok":
        return "bg-green-100 text-green-800";
      case "low":
        return "bg-yellow-100 text-yellow-800";
      case "out":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const lowStockCount = materials.filter((m) => m.status === "low" || m.status === "out").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-sm text-gray-500">Loading inventory...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Material Inventory</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track materials, set thresholds, prevent shortages
          </p>
        </div>
        <div className="flex items-center gap-4">
          {lowStockCount > 0 && (
            <Link
              href="/purchase-orders"
              className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
            >
              {lowStockCount} Low Stock Alert{lowStockCount > 1 ? "s" : ""}
            </Link>
          )}
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Add Material
          </button>
        </div>
      </div>

      {/* Add Material Form */}
      {showAddForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Add New Material</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Material Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Black Shingles"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
              <select
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="bundle">Bundle</option>
                <option value="roll">Roll</option>
                <option value="sheet">Sheet</option>
                <option value="lbs">Lbs</option>
                <option value="each">Each</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Current Quantity
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Minimum Threshold
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.min_quantity}
                onChange={(e) => setFormData({ ...formData, min_quantity: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="0"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleAddMaterial}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
            >
              Save Material
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setFormData({ name: "", unit: "bundle", quantity: "", min_quantity: "" });
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Materials Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">Materials</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Material
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Quantity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Minimum
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {materials.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                    No materials in inventory. Add your first material above.
                  </td>
                </tr>
              ) : (
                materials.map((material) => (
                  <tr key={material.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Package className="w-5 h-5 text-gray-400 mr-2" />
                        <div className="text-sm font-medium text-gray-900">{material.name}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {material.quantity} {material.unit}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {material.min_quantity} {material.unit}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(
                          material.status
                        )}`}
                      >
                        {material.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleAdjustQuantity(material.id, 1)}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          +1
                        </button>
                        <button
                          onClick={() => handleAdjustQuantity(material.id, -1)}
                          className="text-red-600 hover:text-red-800 font-medium"
                        >
                          -1
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
































