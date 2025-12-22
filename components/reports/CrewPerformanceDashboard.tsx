'use client'

import { useState, useEffect } from 'react'
import { Activity, Award, AlertTriangle, CheckCircle2 } from 'lucide-react'

interface CrewPerformanceDashboardProps {
  workspaceId: string
  companyId?: string
}

export function CrewPerformanceDashboard({ workspaceId, companyId }: CrewPerformanceDashboardProps) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/reports/crews?workspace_id=${workspaceId}${companyId ? `&company_id=${companyId}` : ''}`)
      .then(r => r.json())
      .then(data => {
        setData(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Error loading crew data:', err)
        setLoading(false)
      })
  }, [workspaceId, companyId])

  if (loading) {
    return <div className="text-center py-12">Loading crew performance data...</div>
  }

  const summary = data?.summary || {}
  const reports = data?.reports || []

  // Sort by performance score
  const sortedCrews = [...(reports || [])].sort((a, b) => 
    (Number(b.performance_score) || 0) - (Number(a.performance_score) || 0)
  )

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border rounded-lg p-6">
          <div className="text-sm text-gray-500 mb-1">Total Jobs Completed</div>
          <div className="text-3xl font-bold text-gray-900">
            {summary.total_jobs_completed || 0}
          </div>
          <div className="text-sm text-gray-500 mt-2">
            {summary.total_crews || 0} active crews
          </div>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <div className="text-sm text-gray-500 mb-1">Avg Efficiency</div>
          <div className={`text-3xl font-bold ${
            (summary.avg_efficiency || 0) > 80 ? 'text-green-600' : 
            (summary.avg_efficiency || 0) > 60 ? 'text-orange-600' : 'text-red-600'
          }`}>
            {(summary.avg_efficiency || 0).toFixed(0)}%
          </div>
          <div className="text-sm text-gray-500 mt-2">
            Target: 80%+
          </div>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <div className="text-sm text-gray-500 mb-1">Avg Quality Score</div>
          <div className={`text-3xl font-bold ${
            (summary.avg_quality || 0) > 90 ? 'text-green-600' : 
            (summary.avg_quality || 0) > 75 ? 'text-orange-600' : 'text-red-600'
          }`}>
            {(summary.avg_quality || 0).toFixed(0)}%
          </div>
          <div className="text-sm text-gray-500 mt-2">
            {summary.total_rework || 0} rework jobs
          </div>
        </div>

        <div className="bg-white border rounded-lg p-6">
          <div className="text-sm text-gray-500 mb-1">Avg Safety Score</div>
          <div className={`text-3xl font-bold ${
            (summary.avg_safety || 0) > 95 ? 'text-green-600' : 
            (summary.avg_safety || 0) > 85 ? 'text-orange-600' : 'text-red-600'
          }`}>
            {(summary.avg_safety || 0).toFixed(0)}%
          </div>
          <div className="text-sm text-gray-500 mt-2">
            {summary.total_issues || 0} issues reported
          </div>
        </div>
      </div>

      {/* Top Performers */}
      {sortedCrews.length > 0 && (
        <div className="bg-white border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Award className="h-5 w-5 text-yellow-500" />
            Top Performing Crews
          </h3>
          <div className="space-y-4">
            {sortedCrews.slice(0, 5).map((crew: any, index: number) => (
              <div key={crew.id} className="border-b pb-4 last:border-0">
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
                      <div className="font-medium">{crew.crew_name || 'Unknown Crew'}</div>
                      <div className="text-sm text-gray-500">
                        {crew.jobs_completed || 0} jobs completed
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-lg font-semibold ${
                      (Number(crew.performance_score) || 0) > 80 ? 'text-green-600' : 
                      (Number(crew.performance_score) || 0) > 60 ? 'text-orange-600' : 'text-red-600'
                    }`}>
                      {(Number(crew.performance_score) || 0).toFixed(0)}%
                    </div>
                    <div className="text-sm text-gray-500">Performance</div>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-4 text-sm text-gray-600 mt-2">
                  <div>
                    <span className="text-gray-500">Efficiency: </span>
                    {(Number(crew.efficiency_score) || 0).toFixed(0)}%
                  </div>
                  <div>
                    <span className="text-gray-500">Quality: </span>
                    {(Number(crew.quality_score) || 0).toFixed(0)}%
                  </div>
                  <div>
                    <span className="text-gray-500">Safety: </span>
                    {(Number(crew.safety_score) || 0).toFixed(0)}%
                  </div>
                  <div>
                    <span className="text-gray-500">Rework: </span>
                    {crew.rework_count || 0}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Crews Table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-semibold">All Crews</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Crew</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Jobs Completed</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">On-Time Rate</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Efficiency</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Quality</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Safety</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Rework</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Performance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {reports.map((crew: any) => {
                const perfScore = Number(crew.performance_score) || 0
                return (
                  <tr key={crew.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {crew.crew_name || 'Unknown Crew'}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-600">
                      {crew.jobs_completed || 0}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-600">
                      {(Number(crew.on_time_rate) || 0).toFixed(1)}%
                    </td>
                    <td className={`px-6 py-4 text-sm text-right font-medium ${
                      (Number(crew.efficiency_score) || 0) > 80 ? 'text-green-600' : 
                      (Number(crew.efficiency_score) || 0) > 60 ? 'text-orange-600' : 'text-red-600'
                    }`}>
                      {(Number(crew.efficiency_score) || 0).toFixed(0)}%
                    </td>
                    <td className={`px-6 py-4 text-sm text-right font-medium ${
                      (Number(crew.quality_score) || 0) > 90 ? 'text-green-600' : 
                      (Number(crew.quality_score) || 0) > 75 ? 'text-orange-600' : 'text-red-600'
                    }`}>
                      {(Number(crew.quality_score) || 0).toFixed(0)}%
                    </td>
                    <td className={`px-6 py-4 text-sm text-right font-medium ${
                      (Number(crew.safety_score) || 0) > 95 ? 'text-green-600' : 
                      (Number(crew.safety_score) || 0) > 85 ? 'text-orange-600' : 'text-red-600'
                    }`}>
                      {(Number(crew.safety_score) || 0).toFixed(0)}%
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-600">
                      {crew.rework_count || 0}
                    </td>
                    <td className={`px-6 py-4 text-sm text-right font-medium ${
                      perfScore > 80 ? 'text-green-600' : 
                      perfScore > 60 ? 'text-orange-600' : 'text-red-600'
                    }`}>
                      {perfScore.toFixed(0)}%
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

























