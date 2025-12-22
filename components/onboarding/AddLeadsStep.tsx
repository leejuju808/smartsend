// Block 21675 — Add Leads Step Component
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddLeadsStep() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadLeads() {
    if (!file) {
      setError("Please select a CSV file");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/onboarding/import-leads", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to upload leads");
      }

      // Update onboarding step
      await fetch("/api/onboarding/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_step: "choose-template" }),
      });

      router.push("/onboarding/choose-template");
    } catch (err: any) {
      setError(err.message || "Failed to upload leads");
      setIsUploading(false);
    }
  }

  async function skip() {
    try {
      await fetch("/api/onboarding/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_step: "choose-template" }),
      });
      router.push("/onboarding/choose-template");
    } catch (error) {
      console.error("Error updating onboarding step:", error);
      router.push("/onboarding/choose-template");
    }
  }

  return (
    <div className="bg-white p-8 rounded-xl shadow-sm border space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
          Add Homeowner Leads
        </h1>
        <p className="text-sm text-gray-600">
          Upload a CSV of homeowners you'd like to reach out to.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            CSV File
          </label>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          {file && (
            <p className="mt-2 text-sm text-gray-600">
              Selected: {file.name}
            </p>
          )}
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <button
          disabled={!file || isUploading}
          onClick={uploadLeads}
          className="w-full px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
        >
          {isUploading ? "Uploading..." : "Upload & Continue"}
        </button>
      </div>

      <button
        onClick={skip}
        className="text-sm text-gray-600 underline hover:text-gray-800"
      >
        Skip for now
      </button>
    </div>
  );
}














































