"use client";

import { useEffect, useState } from "react";
import { Building2, TrendingUp, Calendar, Share2 } from "lucide-react";
import Link from "next/link";

export function HQCommandCenter() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      const response = await fetch("/api/hq/command-center");
      if (!response.ok) {
        throw new Error("Failed to fetch command center data");
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error("Error fetching command center data:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
        <div className="text-gray-400">Loading command center...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
        <div className="text-red-400">Failed to load command center data</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="w-5 h-5 text-blue-400" />
            <h3 className="text-sm font-medium text-gray-400">Total Branches</h3>
          </div>
          <p className="text-2xl font-bold text-white">{data.summary?.total_branches || 0}</p>
        </div>

        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-green-400" />
            <h3 className="text-sm font-medium text-gray-400">Leads Today</h3>
          </div>
          <p className="text-2xl font-bold text-white">{data.summary?.leads_today || 0}</p>
        </div>

        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-green-400" />
            <h3 className="text-sm font-medium text-gray-400">Jobs Sold Today</h3>
          </div>
          <p className="text-2xl font-bold text-white">{data.summary?.jobs_sold_today || 0}</p>
        </div>

        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-green-400" />
            <h3 className="text-sm font-medium text-gray-400">Revenue Today</h3>
          </div>
          <p className="text-2xl font-bold text-white">
            ${((data.summary?.revenue_today || 0) / 1000).toFixed(1)}k
          </p>
        </div>
      </div>

      {/* Branch Performance Table */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Branch Performance</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-2 px-4 text-sm font-medium text-gray-400">Branch</th>
                <th className="text-right py-2 px-4 text-sm font-medium text-gray-400">Leads Today</th>
                <th className="text-right py-2 px-4 text-sm font-medium text-gray-400">Jobs Sold</th>
                <th className="text-right py-2 px-4 text-sm font-medium text-gray-400">Revenue</th>
                <th className="text-right py-2 px-4 text-sm font-medium text-gray-400">Avg Cycle Time</th>
              </tr>
            </thead>
            <tbody>
              {data.branchPerformance?.map((branch: any) => (
                <tr key={branch.branch_id} className="border-b border-gray-700/50">
                  <td className="py-3 px-4">
                    <Link
                      href={`/branches/${branch.branch_id}`}
                      className="text-white hover:text-blue-400"
                    >
                      {branch.branch_name}
                    </Link>
                    <div className="text-xs text-gray-400">{branch.city}, {branch.state}</div>
                  </td>
                  <td className="text-right py-3 px-4 text-white">{branch.leads_today || 0}</td>
                  <td className="text-right py-3 px-4 text-white">{branch.jobs_sold_today || 0}</td>
                  <td className="text-right py-3 px-4 text-white">
                    ${((branch.revenue_today || 0) / 1000).toFixed(1)}k
                  </td>
                  <td className="text-right py-3 px-4 text-white">
                    {branch.avg_cycle_time_days?.toFixed(1) || "N/A"} days
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Shared Resources */}
      {data.sharedResources && data.sharedResources.length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Share2 className="w-5 h-5 text-gray-400" />
            <h2 className="text-lg font-semibold text-white">Available Shared Resources</h2>
          </div>
          <div className="space-y-2">
            {data.sharedResources.slice(0, 5).map((resource: any, idx: number) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg"
              >
                <div>
                  <span className="text-white font-medium capitalize">{resource.resource_type}</span>
                  <div className="text-xs text-gray-400">From {resource.branch_name}</div>
                </div>
                <span className="text-xs text-green-400">Available</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}





















