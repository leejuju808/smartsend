'use client'

import { useState, useEffect } from 'react'
import { DollarSign, TrendingDown, AlertTriangle, CheckCircle2, BarChart3 } from 'lucide-react'

interface JobProfitabilityDashboardProps {
  workspaceId: string
  companyId?: string
}

export function JobProfitabilityDashboard({ workspaceId, companyId }: JobProfitabilityDashboardProps) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/reports/job-profit?workspace_id=${workspaceId}${companyId ? `&company_id=${companyId}` : ''}`)
      .then(r => r.json())
      .then(data => {
        setData(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Error loading job profit data:', err)
        setLoading(false)
      })
  }, [workspaceId, companyId])

  if (loading) {
    return <div className="text-center py-12">Loading job profitability data...</div>
  }

  const summary = data?.summary || {}
  const reports = data?.reports || []
  const byJobType = summary.by_job_type || {}

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border rounded-lg p-6">
          <div className="text-sm text-gray-500 mb-1">Avg Job Profit</div>
          <div className="text-3xl font-bold text-gray-900">
            ${((summary.total_profit || 0) / (summary.total_jobs || 1)).toFixed(0)}
          </div>
          <div className="text-sm text-gray-500 mt-2">
            {summary.total_jobs || 0} jobs
          </div>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <div className="text-sm text-gray-500 mb-1">Avg Job Margin</div>
          <div className={`text-3xl font-bold ${summary.avg_margin > 30 ? 'text-green-600' : summary.avg_margin > 20 ? 'text-orange-600' : 'text-red-600'}`}>
            {(summary.avg_margin || 0).toFixed(1)}%
          </div>
          <div className="text-sm text-gray-500 mt-2">
            Target: 30%+
          </div>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <div className="text-sm text-gray-500 mb-1">Total Revenue</div>
          <div className="text-3xl font-bold text-gray-900">
            ${((summary.total_revenue || 0) / 1000).toFixed(1)}K
          </div>
          <div className="text-sm text-gray-500 mt-2">
            Total Cost: ${((summary.total_cost || 0) / 1000).toFixed(1)}K
          </div>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <div className="text-sm text-gray-500 mb-1">Loss-Generating Jobs</div>
          <div className={`text-3xl font-bold ${summary.loss_jobs_count > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {summary.loss_jobs_count || 0}
          </div>
          <div className="text-sm text-red-600 mt-2">
            ${Math.abs(summary.loss_jobs_total || 0).toFixed(0)} lost
          </div>
        </div>
      </div>

      {/* Loss Jobs Alert */}
      {summary.loss_jobs_count > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900">
                {summary.loss_jobs_count} jobs are losing money
              </h3>
              <p className="text-sm text-red-800 mt-1">
                Total loss: ${Math.abs(summary.loss_jobs_total || 0).toFixed(2)}. 
                Review these jobs to identify cost overruns and pricing issues.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Profitability by Job Type */}
      <div className="bg-white border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Profitability by Job Type</h3>
        <div className="space-y-4">
          {Object.entries(byJobType).map(([type, stats]: [string, any]) => (
            <div key={type} className="border-b pb-4 last:border-0">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium capitalize">{type}</div>
                <div className={`text-lg font-semibold ${stats.margin > 30 ? 'text-green-600' : stats.margin > 20 ? 'text-orange-600' : 'text-red-600'}`}>
                  {stats.margin.toFixed(1)}% margin
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm text-gray-600">
                <div>
                  <span className="text-gray-500">Jobs: </span>
                  {stats.count}
                </div>
                <div>
                  <span className="text-gray-500">Revenue: </span>
                  ${(stats.revenue / 1000).toFixed(1)}K
                </div>
                <div>
                  <span className="text-gray-500">Profit: </span>
                  ${(stats.profit / 1000).toFixed(1)}K
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Jobs Table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-semibold">Recent Jobs</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Job</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cost</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Profit</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {reports.slice(0, 10).map((job: any) => (
                <tr key={job.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {job.job_number || job.job_id?.substring(0, 8)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 capitalize">
                    {job.job_type || 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-sm text-right text-gray-900">
                    ${(Number(job.revenue) || 0).toFixed(0)}
                  </td>
                  <td className="px-6 py-4 text-sm text-right text-gray-600">
                    ${(Number(job.total_cost) || 0).toFixed(0)}
                  </td>
                  <td className={`px-6 py-4 text-sm text-right font-medium ${
                    (Number(job.profit) || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    ${(Number(job.profit) || 0).toFixed(0)}
                  </td>
                  <td className={`px-6 py-4 text-sm text-right font-medium ${
                    (Number(job.margin) || 0) > 30 ? 'text-green-600' : 
                    (Number(job.margin) || 0) > 20 ? 'text-orange-600' : 'text-red-600'
                  }`}>
                    {(Number(job.margin) || 0).toFixed(1)}%
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

























