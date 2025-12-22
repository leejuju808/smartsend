"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface SaveAsPlaybookButtonProps {
  campaignId: string;
  campaignName: string;
  isAdmin: boolean;
}

export function SaveAsPlaybookButton({
  campaignId,
  campaignName,
  isAdmin,
}: SaveAsPlaybookButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState(campaignName);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isAdmin) return null;

  const handleSave = async () => {
    if (!name.trim()) {
      alert("Playbook name is required");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/save-as-playbook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          category: category.trim() || null,
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert("Playbook saved successfully!");
        setIsOpen(false);
      } else {
        alert(data.error || "Failed to save playbook");
      }
    } catch (error) {
      console.error("Error saving playbook:", error);
      alert("Failed to save playbook");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        variant="outline"
        size="sm"
      >
        Save as Playbook
      </Button>

      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4">Save as Playbook</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                  placeholder="e.g., SaaS Founder Outreach"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                  rows={3}
                  placeholder="Describe what this playbook is for..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="">Select category</option>
                  <option value="Outbound">Outbound</option>
                  <option value="Reactivation">Reactivation</option>
                  <option value="Expansion">Expansion</option>
                  <option value="Nurture">Nurture</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <Button
                onClick={handleSave}
                disabled={loading}
                className="flex-1"
              >
                {loading ? "Saving..." : "Save Playbook"}
              </Button>
              <Button
                onClick={() => setIsOpen(false)}
                variant="outline"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}








