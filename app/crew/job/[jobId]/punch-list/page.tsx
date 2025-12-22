"use client";

// Block 42000 — SmartSend Roofing Crew App v1
// Punch List Page for Job
// app/crew/job/[jobId]/punch-list/page.tsx

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, CheckCircle, Circle, AlertCircle } from "lucide-react";

export default function JobPunchListPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId as string;
  const [punchList, setPunchList] = useState<any[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState("");

  useEffect(() => {
    loadPunchList();
  }, [jobId]);

  const loadPunchList = async () => {
    try {
      const response = await fetch(`/api/crew/punch-list?job_id=${jobId}`);
      const data = await response.json();
      if (data.success) {
        setPunchList(data.punch_list || []);
      }
    } catch (error) {
      console.error("Error loading punch list:", error);
    }
  };

  const handleAddItem = async () => {
    if (!newItem.trim()) return;

    try {
      const response = await fetch("/api/crew/punch-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          description: newItem,
          status: "pending",
        }),
      });

      const data = await response.json();
      if (data.success) {
        setPunchList((prev) => [data.punch_item, ...prev]);
        setNewItem("");
        setShowAddForm(false);
      }
    } catch (error) {
      console.error("Error adding punch item:", error);
      alert("Failed to add item. Please try again.");
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      const response = await fetch(`/api/crew/punch-list/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      const data = await response.json();
      if (data.success) {
        setPunchList((prev) =>
          prev.map((item) => (item.id === id ? data.punch_item : item))
        );
      }
    } catch (error) {
      console.error("Error updating punch item:", error);
      alert("Failed to update item. Please try again.");
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case "needs_attention":
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      default:
        return <Circle className="w-5 h-5 text-gray-400" />;
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
          <h1 className="text-xl font-semibold">Punch List</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Add Item Button */}
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Punch List Item
        </button>

        {/* Add Item Form */}
        {showAddForm && (
          <div className="bg-white rounded-lg p-4 shadow-sm space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={3}
                placeholder="Enter punch list item..."
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleAddItem}
                className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewItem("");
                }}
                className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Punch List Items */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Items</h2>
          {punchList.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No items yet</p>
          ) : (
            <div className="space-y-2">
              {punchList.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
                >
                  <button
                    onClick={() =>
                      handleUpdateStatus(
                        item.id,
                        item.status === "completed" ? "pending" : "completed"
                      )
                    }
                    className="mt-0.5"
                  >
                    {getStatusIcon(item.status)}
                  </button>
                  <div className="flex-1">
                    <div
                      className={
                        item.status === "completed"
                          ? "text-gray-500 line-through"
                          : "text-gray-900"
                      }
                    >
                      {item.description}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {new Date(item.created_at).toLocaleString()}
                    </div>
                  </div>
                  <select
                    value={item.status}
                    onChange={(e) => handleUpdateStatus(item.id, e.target.value)}
                    className="text-xs px-2 py-1 border border-gray-300 rounded"
                  >
                    <option value="pending">Pending</option>
                    <option value="needs_attention">Needs Attention</option>
                    <option value="needs_material">Needs Material</option>
                    <option value="needs_qc">Needs QC</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}































