/**
 * Panel 3: Forecasting Engine (AI)
 */

'use client'

interface ForecastData {
  forecast_30d: number
  forecast_90d: number
  risk_level: string
  drivers: {
    pending_supplements: number
    leads_in_pipeline: number
    close_rate: number
    avg_job_value: number
  }
}

export default function ForecastingPanel({ data }: { data?: ForecastData }) {
  if (!data) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Forecasting Engine</h2>
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

  const getRiskColor = (risk: string) => {
    switch (risk.toLowerCase()) {
      case 'low':
        return 'text-green-600 bg-green-50'
      case 'medium':
        return 'text-yellow-600 bg-yellow-50'
      case 'high':
        return 'text-red-600 bg-red-50'
      default:
        return 'text-gray-600 bg-gray-50'
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-lg font-semibold mb-4">Forecasting Engine (AI)</h2>
      
      <div className="space-y-4">
        {/* Forecasts */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-gray-500">Next 30 Days</div>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(data.forecast_30d)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Next 90 Days</div>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(data.forecast_90d)}
            </div>
          </div>
        </div>

        {/* Risk Level */}
        <div>
          <div className="text-xs text-gray-500 mb-1">Risk Level</div>
          <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getRiskColor(data.risk_level)}`}>
            {data.risk_level}
          </div>
        </div>

        {/* Forecast Drivers */}
        <div className="border-t pt-4">
          <div className="text-xs font-medium text-gray-700 mb-2">Forecast Drivers</div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Pending Supplements</span>
              <span className="font-medium">{formatCurrency(data.drivers.pending_supplements)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Leads in Pipeline</span>
              <span className="font-medium">{data.drivers.leads_in_pipeline}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Close Rate</span>
              <span className="font-medium">{data.drivers.close_rate.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Avg Job Value</span>
              <span className="font-medium">{formatCurrency(data.drivers.avg_job_value)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}






































