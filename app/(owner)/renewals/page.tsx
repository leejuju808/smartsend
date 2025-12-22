"use client";

// Block 26720 — SmartSend Roofing Renewal & Maintenance Route Engine v1
// UI Page: Renewal & Maintenance Opportunities

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type RenewalOpportunity = {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
  opportunity_type: "reroof" | "inspection" | "maintenance";
  recommended_date: string;
  priority: "low" | "medium" | "high" | "urgent";
  reason: string;
  status: "pending" | "scheduled" | "contacted" | "completed" | "declined" | "cancelled";
  scheduled_date?: string;
  estimated_value?: number;
  roof_material?: string;
  last_roof_date?: string;
  property_address?: string;
  created_at: string;
  updated_at: string;
};

export default function RenewalsPage() {
  const [opportunities, setOpportunities] = useState<RenewalOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetchOpportunities();
  }, [filterStatus, filterType]);

  const fetchOpportunities = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.append("status", filterStatus);
      if (filterType !== "all") params.append("type", filterType);
      
      const response = await fetch(`/api/renewal-opportunities?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch opportunities");
      }
      
      const data = await response.json();
      setOpportunities(data.opportunities || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load opportunities");
      console.error("Error fetching opportunities:", err);
    } finally {
      setLoading(false);
    }
  };

  const generateOpportunities = async () => {
    try {
      setGenerating(true);
      const response = await fetch("/api/renewal-opportunities", {
        method: "POST",
      });
      
      if (!response.ok) {
        throw new Error("Failed to generate opportunities");
      }
      
      const data = await response.json();
      alert(
        `Generated ${data.renewal_opportunities_created} renewal opportunities and ${data.maintenance_opportunities_created} maintenance opportunities`
      );
      
      // Refresh the list
      await fetchOpportunities();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to generate opportunities");
      console.error("Error generating opportunities:", err);
    } finally {
      setGenerating(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "scheduled":
        return "bg-blue-100 text-blue-800";
      case "contacted":
        return "bg-purple-100 text-purple-800";
      case "completed":
        return "bg-green-100 text-green-800";
      case "declined":
        return "bg-red-100 text-red-800";
      case "cancelled":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "bg-red-100 text-red-800";
      case "high":
        return "bg-orange-100 text-orange-800";
      case "medium":
        return "bg-yellow-100 text-yellow-800";
      case "low":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "reroof":
        return "Re-Roof";
      case "inspection":
        return "Inspection";
      case "maintenance":
        return "Maintenance";
      default:
        return type;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-lg">Loading renewal opportunities...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Renewal & Maintenance Opportunities</h1>
          <p className="text-sm text-gray-500 mt-1">
            Turn past customers into future revenue. Auto-detected re-roofs, seasonal maintenance, and inspection opportunities.
          </p>
        </div>
        <Button
          onClick={generateOpportunities}
          disabled={generating}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {generating ? "Generating..." : "Generate Opportunities"}
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div>
          <label className="text-sm font-medium text-gray-700 mr-2">Status:</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1 text-sm"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="scheduled">Scheduled</option>
            <option value="contacted">Contacted</option>
            <option value="completed">Completed</option>
            <option value="declined">Declined</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mr-2">Type:</label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1 text-sm"
          >
            <option value="all">All</option>
            <option value="reroof">Re-Roof</option>
            <option value="inspection">Inspection</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </div>
        <div className="text-sm text-gray-600">
          {opportunities.length} opportunity{opportunities.length !== 1 ? "ies" : ""} found
        </div>
      </div>

      {/* Opportunities Table */}
      {opportunities.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-gray-600 mb-4">No renewal opportunities found.</p>
          <p className="text-sm text-gray-500">
            Click "Generate Opportunities" to scan for re-roofs and maintenance needs.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Customer</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Type</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Recommended</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Priority</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Reason</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {opportunities.map((opp) => (
                  <tr key={opp.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{opp.customer_name}</div>
                      {opp.customer_email && (
                        <div className="text-xs text-gray-500">{opp.customer_email}</div>
                      )}
                      {opp.property_address && (
                        <div className="text-xs text-gray-400 mt-1">{opp.property_address}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                        {getTypeLabel(opp.opportunity_type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {formatDate(opp.recommended_date)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getPriorityColor(opp.priority)}`}>
                        {opp.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs truncate" title={opp.reason}>
                      {opp.reason}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getStatusColor(opp.status)}`}>
                        {opp.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {opp.estimated_value ? `$${opp.estimated_value.toLocaleString()}` : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      {opportunities.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="text-sm text-blue-600 font-medium">Total Opportunities</div>
            <div className="text-2xl font-bold text-blue-900 mt-1">{opportunities.length}</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="text-sm text-green-600 font-medium">Re-Roofs</div>
            <div className="text-2xl font-bold text-green-900 mt-1">
              {opportunities.filter((o) => o.opportunity_type === "reroof").length}
            </div>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="text-sm text-purple-600 font-medium">Maintenance</div>
            <div className="text-2xl font-bold text-purple-900 mt-1">
              {opportunities.filter((o) => o.opportunity_type === "maintenance").length}
            </div>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="text-sm text-orange-600 font-medium">Pending</div>
            <div className="text-2xl font-bold text-orange-900 mt-1">
              {opportunities.filter((o) => o.status === "pending").length}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



































