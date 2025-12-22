"use client";

// Block 42000 — SmartSend Roofing Crew App v1
// Material Usage Page for Job
// app/crew/job/[jobId]/materials/page.tsx

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Package, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const COMMON_MATERIALS = [
  "Bundles (Shingles)",
  "Ridge Caps",
  "Underlayment Rolls",
  "Ice/Water Shield",
  "Nails (lbs)",
  "Drip Edge",
  "Ventilation",
  "Flashing",
];

export default function JobMaterialsPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId as string;
  const [memberId, setMemberId] = useState<string | null>(null);
  const [materials, setMaterials] = useState<any[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    material_name: "",
    quantity: "",
    unit: "each",
  });

  useEffect(() => {
    async function loadData() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const { data: member } = await supabase
        .from("crew_members")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (member) {
        setMemberId(member.id);
      }

      // Load existing materials
      const { data: materialsData } = await supabase
        .from("material_usage")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });

      if (materialsData) {
        setMaterials(materialsData);
      }
    }

    loadData();
  }, [jobId, router]);

  const handleAddMaterial = async () => {
    if (!memberId || !formData.material_name || !formData.quantity) {
      alert("Please fill in all fields");
      return;
    }

    try {
      const response = await fetch("/api/crew/materials/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          member_id: memberId,
          material_name: formData.material_name,
          quantity: parseFloat(formData.quantity),
          unit: formData.unit,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setMaterials((prev) => [data.material_usage, ...prev]);
        setFormData({ material_name: "", quantity: "", unit: "each" });
        setShowAddForm(false);
        alert("Material usage recorded!");
      } else {
        alert("Failed to record material: " + (data.error || "Unknown error"));
      }
    } catch (error) {
      console.error("Error adding material:", error);
      alert("Failed to record material. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-semibold">Material Usage</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Add Material Button */}
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Material Usage
        </button>

        {/* Add Material Form */}
        {showAddForm && (
          <div className="bg-white rounded-lg p-4 shadow-sm space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Material
              </label>
              <select
                value={formData.material_name}
                onChange={(e) =>
                  setFormData({ ...formData, material_name: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select material...</option>
                {COMMON_MATERIALS.map((mat) => (
                  <option key={mat} value={mat}>
                    {mat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Quantity
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  value={formData.quantity}
                  onChange={(e) =>
                    setFormData({ ...formData, quantity: e.target.value })
                  }
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0.00"
                />
                <select
                  value={formData.unit}
                  onChange={(e) =>
                    setFormData({ ...formData, unit: e.target.value })
                  }
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="each">each</option>
                  <option value="sq">sq</option>
                  <option value="lbs">lbs</option>
                  <option value="rolls">rolls</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleAddMaterial}
                className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setFormData({ material_name: "", quantity: "", unit: "each" });
                }}
                className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Materials List */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Recorded Materials</h2>
          {materials.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No materials recorded yet
            </p>
          ) : (
            <div className="space-y-2">
              {materials.map((mat) => (
                <div
                  key={mat.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <div className="font-medium text-gray-900">
                      {mat.material_name}
                    </div>
                    <div className="text-sm text-gray-500">
                      {new Date(mat.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-lg font-semibold text-gray-900">
                    {mat.quantity} {mat.unit}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}































