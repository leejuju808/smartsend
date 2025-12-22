/**
 * Block 25420 — SmartSend Roofing Marketing Engine v1
 * Marketing Dashboard Page
 * 
 * Main dashboard for managing marketing campaigns
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Campaign {
  id: string;
  name: string;
  campaign_type: string;
  status: string;
  total_recipients: number;
  total_sent: number;
  total_opens: number;
  total_replies: number;
  total_bookings: number;
  total_revenue: number;
  created_at: string;
}

export default function MarketingDashboardPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCampaigns();
  }, []);

  async function loadCampaigns() {
    try {
      // Get workspace_id from context or URL
      const workspaceId = localStorage.getItem("workspace_id") || "";
      
      const response = await fetch(`/api/marketing/campaigns?workspace_id=${workspaceId}`);
      const data = await response.json();
      
      if (data.campaigns) {
        setCampaigns(data.campaigns);
      }
    } catch (error) {
      console.error("Error loading campaigns:", error);
    } finally {
      setLoading(false);
    }
  }

  const campaignTypes = {
    inspection: "Inspection Campaign",
    insurance_education: "Insurance Education",
    previous_estimates: "Previous Estimates",
    referral: "Referral Campaign",
    seasonal: "Seasonal Campaign",
    storm_outbound: "Storm Outbound",
    lead_nurture: "Lead Nurture",
    newsletter: "Newsletter",
    customer_database: "Customer Database",
    custom: "Custom Campaign",
  };

  const statusColors = {
    draft: "bg-gray-100 text-gray-800",
    scheduled: "bg-blue-100 text-blue-800",
    active: "bg-green-100 text-green-800",
    paused: "bg-yellow-100 text-yellow-800",
    completed: "bg-purple-100 text-purple-800",
    cancelled: "bg-red-100 text-red-800",
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse">Loading campaigns...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Outreach Engine</h1>
        <p className="text-gray-600">
          Outreach running → conversations moving → jobs closing.
        </p>
      </div>

      <div className="mb-6 flex gap-4">
        <Link
          href="/dashboard/marketing/campaigns/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Create Campaign
        </Link>
        <Link
          href="/dashboard/marketing/templates"
          className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
        >
          Templates
        </Link>
        <Link
          href="/dashboard/marketing/analytics"
          className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
        >
          Analytics
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Campaigns</h3>
          <p className="text-3xl font-bold">{campaigns.length}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Active Campaigns</h3>
          <p className="text-3xl font-bold">
            {campaigns.filter((c) => c.status === "active").length}
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Revenue</h3>
          <p className="text-3xl font-bold">
            ${campaigns.reduce((sum, c) => sum + (c.total_revenue || 0), 0).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="text-xl font-semibold">Campaigns</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Campaign
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Sent
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Opens
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Replies
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Bookings
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Revenue
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {campaigns.map((campaign) => (
                <tr key={campaign.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium">{campaign.name}</div>
                    <div className="text-sm text-gray-500">
                      {new Date(campaign.created_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {campaignTypes[campaign.campaign_type as keyof typeof campaignTypes] ||
                      campaign.campaign_type}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded ${
                        statusColors[campaign.status as keyof typeof statusColors] ||
                        "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {campaign.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">{campaign.total_sent || 0}</td>
                  <td className="px-6 py-4 text-sm">{campaign.total_opens || 0}</td>
                  <td className="px-6 py-4 text-sm">{campaign.total_replies || 0}</td>
                  <td className="px-6 py-4 text-sm">{campaign.total_bookings || 0}</td>
                  <td className="px-6 py-4 text-sm font-medium">
                    ${(campaign.total_revenue || 0).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <Link
                      href={`/dashboard/marketing/campaigns/${campaign.id}`}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {campaigns.length === 0 && (
            <div className="px-6 py-12 text-center text-gray-500">
              No campaigns yet. Create your first campaign to get started.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}




































