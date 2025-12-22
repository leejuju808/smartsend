/**
 * AI Insights Panel - Auto-generated Action Items
 */

'use client'

interface Insight {
  type: 'action' | 'warning' | 'opportunity' | 'suggestion'
  priority: 'high' | 'medium' | 'low'
  icon: string
  message: string
}

export default function AIInsightsPanel({ insights }: { insights: Insight[] }) {
  if (!insights || insights.length === 0) {
    return null
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'border-red-200 bg-red-50'
      case 'medium':
        return 'border-yellow-200 bg-yellow-50'
      case 'low':
        return 'border-blue-200 bg-blue-50'
      default:
        return 'border-gray-200 bg-gray-50'
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-lg font-semibold mb-4">AI Insights</h2>
      
      <div className="space-y-3">
        {insights.map((insight, idx) => (
          <div
            key={idx}
            className={`p-4 rounded-lg border ${getPriorityColor(insight.priority)}`}
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">{insight.icon}</span>
              <div className="flex-1">
                <div className="font-medium text-gray-900">{insight.message}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {insight.priority.charAt(0).toUpperCase() + insight.priority.slice(1)} priority
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}






































