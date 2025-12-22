"use client";

// Block 48000 — SmartSend Roofing "Inventory + Supplier Purchase Order System" v1
// Create New Purchase Order Page

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, X } from "lucide-react";
import Link from "next/link";

interface POItem {
  material_name: string;
  quantity: string;
  unit: string;
}

export default function CreatePOPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    supplier_name: "",
    delivery_date: "",
    delivery_window: "anytime",
    job_id: "",
  });
  const [items, setItems] = useState<POItem[]>([
    { material_name: "", quantity: "", unit: "bundle" },
  ]);
  const [loading, setLoading] = useState(false);

  const addItem = () => {
    setItems([...items, { material_name: "", quantity: "", unit: "bundle" }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof POItem, value: string) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.supplier_name || !formData.delivery_date) {
      alert("Please fill in supplier name and delivery date");
      return;
    }

    const validItems = items.filter(
      (item) => item.material_name && item.quantity
    );

    if (validItems.length === 0) {
      alert("Please add at least one material item");
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
          job_id: formData.job_id || null,
          supplier_name: formData.supplier_name,
          delivery_date: formData.delivery_date,
          delivery_window: formData.delivery_window,
          items: validItems.map((item) => ({
            material_name: item.material_name,
            quantity: parseFloat(item.quantity),
            unit: item.unit,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create PO");
      }

      router.push("/purchase-orders");
    } catch (error: any) {
      console.error("Error creating PO:", error);
      alert("Failed to create PO: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/purchase-orders"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create Purchase Order</h1>
          <p className="text-sm text-gray-500 mt-1">
            Generate a new purchase order for supplier
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        {/* Supplier Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Supplier Name *
            </label>
            <input
              type="text"
              value={formData.supplier_name}
              onChange={(e) =>
                setFormData({ ...formData, supplier_name: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Delivery Date *
            </label>
            <input
              type="date"
              value={formData.delivery_date}
              onChange={(e) =>
                setFormData({ ...formData, delivery_date: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Delivery Window
            </label>
            <select
              value={formData.delivery_window}
              onChange={(e) =>
                setFormData({ ...formData, delivery_window: e.target.value })
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Job ID (Optional)
            </label>
            <input
              type="text"
              value={formData.job_id}
              onChange={(e) =>
                setFormData({ ...formData, job_id: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Link to a job"
            />
          </div>
        </div>

        {/* Items */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <label className="block text-sm font-medium text-gray-700">
              Materials *
            </label>
            <button
              type="button"
              onClick={addItem}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              <Plus className="w-4 h-4" />
              Add Item
            </button>
          </div>

          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={index} className="flex gap-3 items-start">
                <div className="flex-1">
                  <input
                    type="text"
                    value={item.material_name}
                    onChange={(e) =>
                      updateItem(index, "material_name", e.target.value)
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Material name"
                  />
                </div>
                <div className="w-32">
                  <input
                    type="number"
                    step="0.01"
                    value={item.quantity}
                    onChange={(e) =>
                      updateItem(index, "quantity", e.target.value)
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Quantity"
                  />
                </div>
                <div className="w-32">
                  <select
                    value={item.unit}
                    onChange={(e) => updateItem(index, "unit", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="bundle">Bundle</option>
                    <option value="roll">Roll</option>
                    <option value="sheet">Sheet</option>
                    <option value="lbs">Lbs</option>
                    <option value="each">Each</option>
                  </select>
                </div>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Submit */}
        <div className="flex gap-3 pt-4 border-t border-gray-200">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Purchase Order"}
          </button>
          <Link
            href="/purchase-orders"
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
































