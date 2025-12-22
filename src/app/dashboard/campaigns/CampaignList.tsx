// src/app/dashboard/campaigns/CampaignList.tsx
"use client";
import { useState, useEffect } from "react";
import { getCampaigns, cancelCampaign } from "./actions";
import { EmptyState } from "@/components/EmptyState";
import { MessageSquare } from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  scheduled_for: string;
  status: string;
  created_at: string;
  ab_mode?: string;
  campaign_recipients: Array<{ count: number }>;
  auto_followup_active?: boolean;
}

interface CampaignListProps {
  workspaceId: string;
}

export default function CampaignList({ workspaceId }: CampaignListProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [canceling, setCanceling] = useState<string | null>(null);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const data = await getCampaigns(workspaceId);
      setCampaigns(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch campaigns");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, [workspaceId]);

  const handleCancel = async (campaignId: string) => {
    if (!confirm("Are you sure you want to cancel this campaign?")) {
      return;
    }

    setCanceling(campaignId);
    try {
      await cancelCampaign(campaignId);
      await fetchCampaigns(); // Refresh the list
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel campaign");
    } finally {
      setCanceling(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "scheduled": return "bg-yellow-100 text-yellow-800";
      case "sending": return "bg-blue-100 text-blue-800";
      case "completed": return "bg-green-100 text-green-800";
      case "canceled": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-3 bg-gray-200 rounded"></div>
            <div className="h-3 bg-gray-200 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-6">
        <EmptyState
          title="No campaigns yet"
          subtitle="Create your first campaign to start sending emails to your leads."
          cta="Create Campaign"
          onClick={() => window.location.reload()}
          icon={MessageSquare}
        />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border">
      <div className="px-6 py-4 border-b">
        <h2 className="text-lg font-semibold">📅 Scheduled Campaigns</h2>
      </div>
      
      <div className="divide-y">
        {campaigns.map((campaign) => (
          <div key={campaign.id} className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-medium text-gray-900">
                    {campaign.name}
                  </h3>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(campaign.status)}`}>
                    {campaign.status}
                  </span>
                  {campaign.auto_followup_active && (
                    <span 
                      className="ml-2 inline-flex items-center rounded-full bg-blue-500 text-white px-2 py-0.5 text-xs font-medium"
                    >
                      Auto-Follow-Up Active
                    </span>
                  )}
                  {campaign.ab_mode === "single" && (
                    <span 
                      className="ml-2 inline-flex items-center rounded-full border border-yellow-400 bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-800"
                      title="Winner Locked - Auto-promoted after significance test (p≤0.05, Δ≥5pp)"
                    >
                      Winner Locked
                    </span>
                  )}
                </div>
                
                <div className="text-sm text-gray-500 space-y-1">
                  <p>📅 Scheduled: {formatDate(campaign.scheduled_for)}</p>
                  <p>👥 Recipients: {campaign.campaign_recipients[0]?.count || 0}</p>
                  <p>📝 Created: {formatDate(campaign.created_at)}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {campaign.status === "scheduled" && (
                  <button
                    onClick={() => handleCancel(campaign.id)}
                    disabled={canceling === campaign.id}
                    className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50"
                  >
                    {canceling === campaign.id ? "Canceling..." : "Cancel"}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}