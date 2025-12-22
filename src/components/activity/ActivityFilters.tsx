"use client";

import React, { useState, useEffect } from "react";
import { ActivityFilters as FiltersType } from "@/app/activity/page";

const CATEGORIES = [
  { value: "sending", label: "Sending" },
  { value: "inbox", label: "Inbox" },
  { value: "contact", label: "Contact" },
  { value: "campaign", label: "Campaign" },
  { value: "task", label: "Task" },
  { value: "pipeline", label: "Pipeline" },
  { value: "scheduler", label: "Scheduler" },
  { value: "deliverability", label: "Deliverability" },
  { value: "team", label: "Team" },
  { value: "billing", label: "Billing" },
];

export function ActivityFilters({
  filters,
  onFiltersChange,
}: {
  filters: FiltersType;
  onFiltersChange: (filters: FiltersType) => void;
}) {
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; email: string }[]>([]);

  useEffect(() => {
    // Fetch campaigns
    fetch("/api/campaigns")
      .then((res) => res.json())
      .then((data) => {
        if (data.data) setCampaigns(data.data);
      })
      .catch(console.error);

    // Fetch team members (if endpoint exists)
    fetch("/api/settings/team")
      .then((res) => res.json())
      .then((data) => {
        if (data.members) setUsers(data.members);
      })
      .catch(console.error);
  }, []);

  const updateFilter = (key: keyof FiltersType, value: string | undefined) => {
    onFiltersChange({
      ...filters,
      [key]: value || undefined,
    });
  };

  return (
    <div className="bg-white rounded-lg border p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Category Filter */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Category
          </label>
          <select
            value={filters.category || ""}
            onChange={(e) => updateFilter("category", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-black"
          >
            <option value="">All Categories</option>
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        {/* Campaign Filter */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Campaign
          </label>
          <select
            value={filters.campaign_id || ""}
            onChange={(e) => updateFilter("campaign_id", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-black"
          >
            <option value="">All Campaigns</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </select>
        </div>

        {/* Team Member Filter */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Team Member
          </label>
          <select
            value={filters.user_id || ""}
            onChange={(e) => updateFilter("user_id", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-black"
          >
            <option value="">All Members</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.email}
              </option>
            ))}
          </select>
        </div>

        {/* Date From */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Date From
          </label>
          <input
            type="date"
            value={filters.date_from || ""}
            onChange={(e) => updateFilter("date_from", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>

        {/* Date To */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Date To
          </label>
          <input
            type="date"
            value={filters.date_to || ""}
            onChange={(e) => updateFilter("date_to", e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>
      </div>

      {/* Clear Filters */}
      {(filters.category ||
        filters.campaign_id ||
        filters.user_id ||
        filters.date_from ||
        filters.date_to) && (
        <div>
          <button
            onClick={() => onFiltersChange({})}
            className="text-sm text-gray-600 hover:text-gray-900 underline"
          >
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}





















































