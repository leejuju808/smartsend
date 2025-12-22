/**
 * Panel 6: Insurance KPIs
 */

'use client'

interface InsuranceKPIData {
  insurance_jobs: number
  acv_collected: number
  supplements_submitted: number
  supplements_approved: number
  supplements_denied: number
  depreciation_outstanding: number
  approval_rate: number
  avg_supplement_value: number
  avg_insurance_job_value: number
}

export default function InsuranceKPIsPanel({ data }: { data?: InsuranceKPIData }) {
  if (!data) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Insurance KPIs</h2>
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
      <h2 className="text-lg font-semibold mb-4">Insurance KPIs</h2>
      
      <div className="space-y-4">
        {/* Overview */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-gray-500">Insurance Jobs</div>
            <div className="text-xl font-bold">{data.insurance_jobs}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">ACV Collected</div>
            <div className="text-xl font-bold text-green-600">{data.acv_collected}</div>
          </div>
        </div>

        {/* Supplements */}
        <div className="border-t pt-4">
          <div className="text-sm font-medium text-gray-700 mb-2">Supplements</div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <div className="text-xs text-gray-500">Submitted</div>
              <div className="font-medium">{data.supplements_submitted}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Approved</div>
              <div className="font-medium text-green-600">{data.supplements_approved}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Denied</div>
              <div className="font-medium text-red-600">{data.supplements_denied}</div>
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xs text-gray-500">Approval Rate</div>
            <div className={`text-lg font-bold ${data.approval_rate >= 50 ? 'text-green-600' : 'text-red-600'}`}>
              {data.approval_rate.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Financials */}
        <div className="border-t pt-4">
          <div className="text-sm font-medium text-gray-700 mb-2">Financials</div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Avg Supplement Value</span>
              <span className="font-medium">{formatCurrency(data.avg_supplement_value)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Avg Insurance Job Value</span>
              <span className="font-medium">{formatCurrency(data.avg_insurance_job_value)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Depreciation Outstanding</span>
              <span className="font-medium text-orange-600">{data.depreciation_outstanding} jobs</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}






































