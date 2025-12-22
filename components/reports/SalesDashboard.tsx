'use client'

import { useState, useEffect } from 'react'
import { Users, TrendingUp, Target, Award } from 'lucide-react'

interface SalesDashboardProps {
  workspaceId: string
  companyId?: string
}

export function SalesDashboard({ workspaceId, companyId }: SalesDashboardProps) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/reports/sales?workspace_id=${workspaceId}${companyId ? `&company_id=${companyId}` : ''}`)
      .then(r => r.json())
      .then(data => {
        setData(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Error loading sales data:', err)
        setLoading(false)
      })
  }, [workspaceId, companyId])

  if (loading) {
    return <div className="text-center py-12">Loading sales performance data...</div>
  }

  const summary = data?.summary || {}
  const reports = data?.reports || []

  // Sort by revenue to find top performers
  const sortedReps = [...(reports || [])].sort((a, b) => 
    (Number(b.revenue) || 0) - (Number(a.revenue) || 0)
  )

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border rounded-lg p-6">
          <div className="text-sm text-gray-500 mb-1">Total Revenue</div>
          <div className="text-3xl font-bold text-gray-900">
            ${((summary.total_revenue || 0) / 1000).toFixed(1)}K
          </div>
          <div className="text-sm text-gray-500 mt-2">
            {summary.total_reps || 0} sales reps
          </div>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <div className="text-sm text-gray-500 mb-1">Jobs Sold</div>
          <div className="text-3xl font-bold text-gray-900">
            {summary.total_jobs_sold || 0}
          </div>
          <div className="text-sm text-gray-500 mt-2">
            {summary.total_leads_assigned || 0} leads assigned
          </div>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <div className="text-sm text-gray-500 mb-1">Avg Close Rate</div>
          <div className="text-3xl font-bold text-green-600">
            {(summary.avg_close_rate || 0).toFixed(1)}%
          </div>
          <div className="text-sm text-gray-500 mt-2">
            Industry avg: ~25%
          </div>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <div className="text-sm text-gray-500 mb-1">Avg Ticket Size</div>
          <div className="text-3xl font-bold text-gray-900">
            ${((summary.avg_ticket || 0) / 1000).toFixed(1)}K
          </div>
          <div className="text-sm text-gray-500 mt-2">
            Per job sold
          </div>
        </div>
      </div>

      {/* Top Performers */}
      {sortedReps.length > 0 && (
        <div className="bg-white border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Award className="h-5 w-5 text-yellow-500" />
            Top Sales Reps
          </h3>
          <div className="space-y-4">
            {sortedReps.slice(0, 5).map((rep: any, index: number) => (
              <div key={rep.id} className="border-b pb-4 last:border-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                      index === 0 ? 'bg-yellow-100 text-yellow-700' :
                      index === 1 ? 'bg-gray-100 text-gray-700' :
                      index === 2 ? 'bg-orange-100 text-orange-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {index + 1}
                    </div>
                    <div>
                      <div className="font-medium">{rep.rep_name || 'Unknown'}</div>
                      <div className="text-sm text-gray-500">
                        {rep.jobs_sold || 0} jobs sold
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-gray-900">
                      ${((Number(rep.revenue) || 0) / 1000).toFixed(1)}K
                    </div>
                    <div className="text-sm text-gray-500">
                      {(Number(rep.close_rate) || 0).toFixed(1)}% close rate
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-4 text-sm text-gray-600 mt-2">
                  <div>
                    <span className="text-gray-500">Leads: </span>
                    {rep.leads_assigned || 0}
                  </div>
                  <div>
                    <span className="text-gray-500">Contacted: </span>
                    {rep.leads_contacted || 0}
                  </div>
                  <div>
                    <span className="text-gray-500">Estimates: </span>
                    {rep.estimates_sent || 0}
                  </div>
                  <div>
                    <span className="text-gray-500">Avg Ticket: </span>
                    ${((Number(rep.avg_ticket) || 0) / 1000).toFixed(1)}K
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Reps Table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-semibold">All Sales Reps</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rep</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Leads</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Contacted</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Estimates</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Jobs Sold</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Close Rate</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg Ticket</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {reports.map((rep: any) => (
                <tr key={rep.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {rep.rep_name || 'Unknown'}
                  </td>
                  <td className="px-6 py-4 text-sm text-right text-gray-600">
                    {rep.leads_assigned || 0}
                  </td>
                  <td className="px-6 py-4 text-sm text-right text-gray-600">
                    {rep.leads_contacted || 0}
                  </td>
                  <td className="px-6 py-4 text-sm text-right text-gray-600">
                    {rep.estimates_sent || 0}
                  </td>
                  <td className="px-6 py-4 text-sm text-right font-medium text-gray-900">
                    {rep.jobs_sold || 0}
                  </td>
                  <td className="px-6 py-4 text-sm text-right font-medium text-gray-900">
                    ${((Number(rep.revenue) || 0) / 1000).toFixed(1)}K
                  </td>
                  <td className={`px-6 py-4 text-sm text-right font-medium ${
                    (Number(rep.close_rate) || 0) > 30 ? 'text-green-600' : 
                    (Number(rep.close_rate) || 0) > 20 ? 'text-orange-600' : 'text-red-600'
                  }`}>
                    {(Number(rep.close_rate) || 0).toFixed(1)}%
                  </td>
                  <td className="px-6 py-4 text-sm text-right text-gray-600">
                    ${((Number(rep.avg_ticket) || 0) / 1000).toFixed(1)}K
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

























