"use client";
import { useState } from "react";

export default function AdminExperimentsPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const insertUpgradeBannerExperiment = async () => {
    setLoading(true);
    setMessage("");
    
    try {
      const response = await fetch("/api/experiments/admin/insert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "upgrade_banner",
          variants: [
            { key: "A", weight: 0.5 },
            { key: "B", weight: 0.5 }
          ]
        })
      });

      const result = await response.json();
      
      if (response.ok) {
        setMessage("✅ Experiment created successfully!");
      } else {
        setMessage(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      setMessage(`❌ Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8">A/B Testing Admin</h1>
      
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Create Upgrade Banner Experiment</h2>
        <p className="text-gray-600 mb-4">
          This will create the upgrade_banner experiment with two variants (A and B) 
          each with 50% traffic allocation.
        </p>
        
        <button
          onClick={insertUpgradeBannerExperiment}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Experiment"}
        </button>
        
        {message && (
          <div className="mt-4 p-3 rounded bg-gray-100">
            {message}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Experiment Details</h2>
        <div className="space-y-2 text-sm">
          <p><strong>Name:</strong> upgrade_banner</p>
          <p><strong>Variant A:</strong> "🚀 Upgrade to Pro" - "Unlock full automation today."</p>
          <p><strong>Variant B:</strong> "💡 Don't leave meetings on the table" - "Pro users 2× their booked calls."</p>
          <p><strong>Traffic Split:</strong> 50/50 between variants</p>
          <p><strong>Events Tracked:</strong> viewed_banner, clicked_cta, converted</p>
        </div>
      </div>
    </div>
  );
} 