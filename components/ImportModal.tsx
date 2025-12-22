"use client";

import { useState } from "react";
import { toast } from "sonner";
import { mutate } from "swr";

export default function ImportModal({ 
  selectedCampaignId,
  onClose 
}: { 
  selectedCampaignId: string;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const handleUpload = async () => {
    if (!file) {
      toast.error("Please select a CSV file");
      return;
    }

    if (!selectedCampaignId) {
      toast.error("Please select a campaign");
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("campaign_id", selectedCampaignId);

      const res = await fetch("/api/import-leads", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || "Import failed");
      }

      const result = await res.json();
      toast.success(`${result.inserted} leads imported successfully`);
      
      // Refresh dashboard
      mutate("/api/leads");
      
      // Close modal after a short delay
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (error: any) {
      toast.error(error.message || "Failed to import leads");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-semibold mb-4">Import Leads from CSV</h2>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            CSV File
          </label>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-full file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100"
          />
          <p className="mt-2 text-xs text-gray-500">
            CSV should include: email (required), first_name, last_name, company
          </p>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={loading || !file}
            className="px-4 py-2 text-sm font-medium text-white bg-black rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Importing..." : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}

