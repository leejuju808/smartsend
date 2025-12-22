/**
 * Panel 2: Revenue Summary
 */

'use client'

interface RevenueData {
  revenue_collected_this_week: number
  outstanding_this_week: number
  jobs_completed_this_week: number
  avg_job_value_this_week: number
  revenue_this_month: number
  projected_revenue_this_month: number
  jobs_completed_this_month: number
  avg_job_value_this_month: number
  total_revenue_ytd: number
  avg_monthly_revenue_ytd: number
}

export default function RevenueSummaryPanel({ data }: { data?: RevenueData }) {
  if (!data) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Revenue Summary</h2>
        <p className="text-gray-500">No data available</p>
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

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-lg font-semibold mb-4">Revenue Summary</h2>
      
      <div className="space-y-4">
        {/* This Week */}
        <div className="border-b pb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">This Week</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-500">Revenue Collected</div>
              <div className="text-lg font-bold text-green-600">
                {formatCurrency(data.revenue_collected_this_week)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Outstanding</div>
              <div className="text-lg font-bold text-orange-600">
                {formatCurrency(data.outstanding_this_week)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Jobs Completed</div>
              <div className="text-lg font-bold">{data.jobs_completed_this_week}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Avg Job Value</div>
              <div className="text-lg font-bold">
                {formatCurrency(data.avg_job_value_this_week)}
              </div>
            </div>
          </div>
        </div>

        {/* This Month */}
        <div className="border-b pb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">This Month</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-500">Revenue</div>
              <div className="text-lg font-bold text-green-600">
                {formatCurrency(data.revenue_this_month)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Projection</div>
              <div className="text-lg font-bold">
                {formatCurrency(data.projected_revenue_this_month)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Jobs Completed</div>
              <div className="text-lg font-bold">{data.jobs_completed_this_month}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Avg Job Value</div>
              <div className="text-lg font-bold">
                {formatCurrency(data.avg_job_value_this_month)}
              </div>
            </div>
          </div>
        </div>

        {/* Year-to-Date */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Year-to-Date</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-500">Total Revenue</div>
              <div className="text-lg font-bold text-green-600">
                {formatCurrency(data.total_revenue_ytd)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Avg Monthly Revenue</div>
              <div className="text-lg font-bold">
                {formatCurrency(data.avg_monthly_revenue_ytd)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}






































