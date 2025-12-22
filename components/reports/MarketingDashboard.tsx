'use client'

import { useState, useEffect } from 'react'
import { Target, TrendingUp, DollarSign, BarChart3 } from 'lucide-react'

interface MarketingDashboardProps {
  workspaceId: string
  companyId?: string
}

export function MarketingDashboard({ workspaceId, companyId }: MarketingDashboardProps) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/reports/marketing?workspace_id=${workspaceId}${companyId ? `&company_id=${companyId}` : ''}`)
      .then(r => r.json())
      .then(data => {
        setData(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Error loading marketing data:', err)
        setLoading(false)
      })
  }, [workspaceId, companyId])

  if (loading) {
    return <div className="text-center py-12">Loading marketing ROI data...</div>
  }

  const summary = data?.summary || {}
  const reports = data?.reports || []

  // Sort by ROI
  const sortedChannels = [...(reports || [])].sort((a, b) => 
    (Number(b.roi) || 0) - (Number(a.roi) || 0)
  )

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border rounded-lg p-6">
          <div className="text-sm text-gray-500 mb-1">Total Leads</div>
          <div className="text-3xl font-bold text-gray-900">
            {summary.total_leads || 0}
          </div>
          <div className="text-sm text-gray-500 mt-2">
            {summary.total_channels || 0} channels
          </div>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <div className="text-sm text-gray-500 mb-1">Total Revenue</div>
          <div className="text-3xl font-bold text-gray-900">
            ${((summary.total_revenue || 0) / 1000).toFixed(1)}K
          </div>
          <div className="text-sm text-gray-500 mt-2">
            {summary.total_jobs || 0} jobs won
          </div>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <div className="text-sm text-gray-500 mb-1">Total Spend</div>
          <div className="text-3xl font-bold text-gray-900">
            ${((summary.total_cost || 0) / 1000).toFixed(1)}K
          </div>
          <div className="text-sm text-gray-500 mt-2">
            Avg ROI: {(summary.total_roi || 0).toFixed(1)}%
          </div>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <div className="text-sm text-gray-500 mb-1">Avg Cost Per Lead</div>
          <div className="text-3xl font-bold text-gray-900">
            ${(summary.avg_cost_per_lead || 0).toFixed(0)}
          </div>
          <div className="text-sm text-gray-500 mt-2">
            Industry avg: ~$50-150
          </div>
        </div>
      </div>

      {/* Channel Performance */}
      <div className="bg-white border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Channel Performance by ROI</h3>
        <div className="space-y-4">
          {sortedChannels.map((channel: any) => {
            const roi = Number(channel.roi) || 0
            const isPositive = roi > 0
            
            return (
              <div key={channel.id} className="border-b pb-4 last:border-0">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="font-medium capitalize">{channel.channel.replace(/_/g, ' ')}</div>
                    <div className="text-sm text-gray-500">
                      {channel.leads || 0} leads → {channel.jobs_won || 0} jobs
                    </div>
                  </div>
                  <div className={`text-2xl font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                    {roi > 0 ? '+' : ''}{roi.toFixed(1)}%
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-4 text-sm text-gray-600">
                  <div>
                    <span className="text-gray-500">Revenue: </span>
                    ${((Number(channel.revenue) || 0) / 1000).toFixed(1)}K
                  </div>
                  <div>
                    <span className="text-gray-500">Cost: </span>
                    ${((Number(channel.cost) || 0) / 1000).toFixed(1)}K
                  </div>
                  <div>
                    <span className="text-gray-500">CPL: </span>
                    ${(Number(channel.cost_per_lead) || 0).toFixed(0)}
                  </div>
                  <div>
                    <span className="text-gray-500">Conv Rate: </span>
                    {(Number(channel.conversion_rate) || 0).toFixed(1)}%
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Channel Comparison Table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-semibold">All Marketing Channels</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Channel</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Leads</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Jobs</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">ROI</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">CPL</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">CPJ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {reports.map((channel: any) => {
                const roi = Number(channel.roi) || 0
                return (
                  <tr key={channel.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 capitalize">
                      {channel.channel.replace(/_/g, ' ')}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-600">
                      {channel.leads || 0}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-600">
                      {channel.jobs_won || 0}
                    </td>
                    <td className="px-6 py-4 text-sm text-right font-medium text-gray-900">
                      ${((Number(channel.revenue) || 0) / 1000).toFixed(1)}K
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-600">
                      ${((Number(channel.cost) || 0) / 1000).toFixed(1)}K
                    </td>
                    <td className={`px-6 py-4 text-sm text-right font-medium ${
                      roi > 200 ? 'text-green-600' : 
                      roi > 100 ? 'text-blue-600' : 
                      roi > 0 ? 'text-orange-600' : 'text-red-600'
                    }`}>
                      {roi > 0 ? '+' : ''}{roi.toFixed(1)}%
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-600">
                      ${(Number(channel.cost_per_lead) || 0).toFixed(0)}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-600">
                      ${(Number(channel.cost_per_job) || 0).toFixed(0)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

























