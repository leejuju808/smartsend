"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function CampaignViewPage() {
  const params = useParams();
  const id = params.id as string;
  const [campaign, setCampaign] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadCampaign = async () => {
      try {
        // For now, we'll just show the ID since we don't have a GET endpoint
        // In a real implementation, you'd fetch campaign details here
        setCampaign({ id, status: "draft" });
      } catch (e: any) {
        setError("Error loading campaign: " + e.message);
      } finally {
        setLoading(false);
      }
    };

    loadCampaign();
  }, [id]);

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 mt-2">Loading campaign...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-600">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Campaign Details</h1>
        <p className="text-sm text-gray-600">Campaign ID: {id}</p>
        <p className="text-sm text-gray-600">Status: {campaign?.status || "Unknown"}</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Campaign Actions</h2>
          
          <div className="space-y-3">
            <Link
              href={`/dashboard/campaigns-new/${id}/prepare`}
              className="block w-full p-4 bg-blue-600 text-white text-center rounded-lg hover:bg-blue-700 transition-colors"
            >
              📋 Prepare Recipients
            </Link>
            
            <Link
              href={`/dashboard/campaigns-new/${id}/send`}
              className="block w-full p-4 bg-green-600 text-white text-center rounded-lg hover:bg-green-700 transition-colors"
            >
              🚀 Send Campaign
            </Link>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Campaign Info</h2>
          
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium">ID:</span> {id}
              </div>
              <div>
                <span className="font-medium">Status:</span> {campaign?.status || "Unknown"}
              </div>
              <div>
                <span className="font-medium">Created:</span> {new Date().toLocaleDateString()}
              </div>
            </div>
          </div>

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-medium text-blue-800 mb-2">Next Steps</h3>
            <ol className="text-sm text-blue-600 space-y-1 list-decimal list-inside">
              <li>Prepare your recipient list</li>
              <li>Review and test your campaign</li>
              <li>Start sending in batches</li>
              <li>Monitor progress and results</li>
            </ol>
          </div>
        </div>
      </div>

      <div className="pt-6 border-t">
        <Link
          href="/dashboard/campaigns-new"
          className="text-blue-600 hover:text-blue-800"
        >
          ← Back to Campaigns
        </Link>
      </div>
    </main>
  );
} 