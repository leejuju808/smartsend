'use client'

import { useState, useEffect } from 'react'
import { Sparkles, AlertCircle, Info } from 'lucide-react'

interface AIInsightsPanelProps {
  workspaceId: string
  companyId?: string
}

export function AIInsightsPanel({ workspaceId, companyId }: AIInsightsPanelProps) {
  const [insights, setInsights] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/reports/ai/insights?workspace_id=${workspaceId}${companyId ? `&company_id=${companyId}` : ''}&limit=5`)
      .then(r => r.json())
      .then(data => {
        setInsights(data.insights || [])
        setLoading(false)
      })
      .catch(err => {
        console.error('Error loading insights:', err)
        setLoading(false)
      })
  }, [workspaceId, companyId])

  const generateInsights = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/reports/ai/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId, company_id: companyId }),
      })
      const data = await response.json()
      if (data.insights) {
        setInsights(data.insights)
      }
    } catch (err) {
      console.error('Error generating insights:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">AI Daily Insights</h3>
        </div>
        <button
          onClick={generateInsights}
          disabled={loading}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
        >
          {loading ? 'Generating...' : 'Generate'}
        </button>
      </div>

      {loading && insights.length === 0 ? (
        <div className="text-center py-8 text-gray-500">Generating insights...</div>
      ) : insights.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p className="mb-2">No insights yet</p>
          <button
            onClick={generateInsights}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Generate your first insights
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {insights.map((insight) => (
            <div
              key={insight.id}
              className={`bg-white rounded-lg p-4 border-l-4 ${
                insight.severity === 'critical' ? 'border-red-500' :
                insight.severity === 'warning' ? 'border-orange-500' :
                'border-blue-500'
              }`}
            >
              <div className="flex items-start gap-2">
                {insight.severity === 'critical' || insight.severity === 'warning' ? (
                  <AlertCircle className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
                ) : (
                  <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1">
                  <p className="text-sm text-gray-900">{insight.message}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(insight.generated_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

























