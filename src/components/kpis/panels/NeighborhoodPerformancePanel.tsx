/**
 * Panel 7: Neighborhood Performance
 */

'use client'

interface NeighborhoodMetric {
  neighborhood: string
  jobs_completed: number
  total_revenue: number
  avg_job_value: number
  reply_rate: number
}

export default function NeighborhoodPerformancePanel({ neighborhoods }: { neighborhoods: NeighborhoodMetric[] }) {
  if (!neighborhoods || neighborhoods.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Neighborhood Performance</h2>
        <p className="text-gray-500">No neighborhood data available</p>
      </div>
    )
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  // Get top 3 by revenue
  const topByRevenue = [...neighborhoods]
    .sort((a, b) => b.total_revenue - a.total_revenue)
    .slice(0, 3)

  // Get top by reply rate
  const topByReplyRate = [...neighborhoods]
    .sort((a, b) => b.reply_rate - a.reply_rate)
    .slice(0, 3)

  // Get top by job value
  const topByJobValue = [...neighborhoods]
    .sort((a, b) => b.avg_job_value - a.avg_job_value)
    .slice(0, 3)

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-lg font-semibold mb-4">Neighborhood Performance</h2>
      
      <div className="space-y-4">
        {/* Top by Revenue */}
        <div>
          <div className="text-sm font-medium text-gray-700 mb-2">Top 3 by Revenue</div>
          <div className="space-y-2">
            {topByRevenue.map((n, idx) => (
              <div key={n.neighborhood} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">#{idx + 1}</span>
                  <span className="font-medium">{n.neighborhood}</span>
                </div>
                <span className="font-bold text-green-600">{formatCurrency(n.total_revenue)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top by Reply Rate */}
        <div className="border-t pt-4">
          <div className="text-sm font-medium text-gray-700 mb-2">Top by Reply Rate</div>
          <div className="space-y-2">
            {topByReplyRate.slice(0, 2).map((n) => (
              <div key={n.neighborhood} className="flex items-center justify-between text-sm">
                <span className="font-medium">{n.neighborhood}</span>
                <span className="font-bold text-blue-600">{n.reply_rate.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top by Job Value */}
        <div className="border-t pt-4">
          <div className="text-sm font-medium text-gray-700 mb-2">Top by Job Value</div>
          <div className="space-y-2">
            {topByJobValue.slice(0, 2).map((n) => (
              <div key={n.neighborhood} className="flex items-center justify-between text-sm">
                <span className="font-medium">{n.neighborhood}</span>
                <span className="font-bold text-purple-600">{formatCurrency(n.avg_job_value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}






































