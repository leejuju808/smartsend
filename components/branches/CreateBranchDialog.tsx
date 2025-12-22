"use client";

import { useState } from "react";
import { X } from "lucide-react";

interface CreateBranchDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateBranchDialog({ open, onClose }: CreateBranchDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    city: "",
    state: "",
    address: "",
    phone: "",
    zip_code: "",
    territory_zip_codes: "",
    territory_counties: "",
    service_area_radius_miles: ""
  });

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const territory_zip_codes = formData.territory_zip_codes
        ? formData.territory_zip_codes.split(",").map(z => z.trim()).filter(Boolean)
        : [];
      
      const territory_counties = formData.territory_counties
        ? formData.territory_counties.split(",").map(c => c.trim()).filter(Boolean)
        : [];

      const response = await fetch("/api/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          territory_zip_codes,
          territory_counties,
          service_area_radius_miles: formData.service_area_radius_miles
            ? parseFloat(formData.service_area_radius_miles)
            : null
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create branch");
      }

      onClose();
      window.location.reload();
    } catch (err: any) {
      alert(err.message || "Failed to create branch");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 border border-gray-700 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">Create New Branch</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Branch Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              placeholder="Boise Branch"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                City
              </label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                placeholder="Boise"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                State
              </label>
              <input
                type="text"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                placeholder="ID"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Address
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              placeholder="123 Main St"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                ZIP Code
              </label>
              <input
                type="text"
                value={formData.zip_code}
                onChange={(e) => setFormData({ ...formData, zip_code: e.target.value })}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                placeholder="83701"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Phone
              </label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                placeholder="(208) 555-1234"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Territory ZIP Codes (comma-separated)
            </label>
            <input
              type="text"
              value={formData.territory_zip_codes}
              onChange={(e) => setFormData({ ...formData, territory_zip_codes: e.target.value })}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              placeholder="83701, 83702, 83703"
            />
            <p className="text-xs text-gray-400 mt-1">Leads in these ZIP codes will be routed to this branch</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Territory Counties (comma-separated)
            </label>
            <input
              type="text"
              value={formData.territory_counties}
              onChange={(e) => setFormData({ ...formData, territory_counties: e.target.value })}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              placeholder="Ada, Canyon"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Service Area Radius (miles)
            </label>
            <input
              type="number"
              step="0.1"
              value={formData.service_area_radius_miles}
              onChange={(e) => setFormData({ ...formData, service_area_radius_miles: e.target.value })}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
              placeholder="50"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Branch"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}





















