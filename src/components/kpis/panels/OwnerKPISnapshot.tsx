/**
 * Panel 8: Owner KPI Snapshot (Executive View)
 */

'use client'

interface OwnerSnapshotData {
  jobs_active: number
  jobs_at_risk: number
  jobs_completed_this_month: number
  revenue_this_month: number
  outstanding_payments: number
  supplement_approval_rate: number
  crew_efficiency: number
  supplier_reliability: number
}

export default function OwnerKPISnapshot({ data }: { data?: OwnerSnapshotData }) {
  if (!data) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Owner KPI Snapshot</h2>
        <p className="text-gray-500">No data available</p>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 p-6">
      <h2 className="text-xl font-bold mb-4 text-gray-900">Owner KPI Snapshot</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <MetricItem label="Jobs Active" value={data.jobs_active} />
        <MetricItem label="Jobs At Risk" value={data.jobs_at_risk} className="text-orange-600" />
        <MetricItem label="Completed This Month" value={data.jobs_completed_this_month} />
        <MetricItem 
          label="Revenue This Month" 
          value={`$${(data.revenue_this_month / 1000).toFixed(0)}K`} 
          className="text-green-600"
        />
        <MetricItem 
          label="Outstanding" 
          value={`$${(data.outstanding_payments / 1000).toFixed(0)}K`} 
          className="text-red-600"
        />
        <MetricItem label="Supplement Approval" value={`${data.supplement_approval_rate}%`} />
        <MetricItem label="Crew Efficiency" value={`${data.crew_efficiency}%`} />
        <MetricItem label="Supplier Reliability" value={`${data.supplier_reliability}%`} />
      </div>
    </div>
  )
}

function MetricItem({ 
  label, 
  value, 
  className = '' 
}: { 
  label: string
  value: string | number
  className?: string 
}) {
  return (
    <div className="text-center">
      <div className={`text-2xl font-bold ${className}`}>{value}</div>
      <div className="text-xs text-gray-600 mt-1">{label}</div>
    </div>
  )
}






































