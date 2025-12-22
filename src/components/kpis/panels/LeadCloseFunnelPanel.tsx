/**
 * Panel 1: Lead → Close Funnel
 */

'use client'

interface LeadFunnelData {
  leads_received_this_week: number
  inspections_set: number
  quotes_sent: number
  approved: number
  scheduled: number
  jobs_completed: number
  lead_to_inspection_rate: number
  inspection_to_quote_rate: number
  quote_to_close_rate: number
  close_to_install_rate: number
}

export default function LeadCloseFunnelPanel({ data }: { data?: LeadFunnelData }) {
  if (!data) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Lead → Close Funnel</h2>
        <p className="text-gray-500">No data available</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-lg font-semibold mb-4">Lead → Close Funnel</h2>
      
      {/* Funnel Steps */}
      <div className="space-y-3">
        <FunnelStep label="Leads Received" value={data.leads_received_this_week} />
        <FunnelStep 
          label="Inspections Set" 
          value={data.inspections_set} 
          rate={data.lead_to_inspection_rate}
        />
        <FunnelStep 
          label="Quotes Sent" 
          value={data.quotes_sent} 
          rate={data.inspection_to_quote_rate}
        />
        <FunnelStep 
          label="Approved" 
          value={data.approved} 
          rate={data.quote_to_close_rate}
        />
        <FunnelStep 
          label="Scheduled" 
          value={data.scheduled} 
          rate={data.close_to_install_rate}
        />
        <FunnelStep label="Jobs Completed" value={data.jobs_completed} />
      </div>
    </div>
  )
}

function FunnelStep({ 
  label, 
  value, 
  rate 
}: { 
  label: string
  value: number
  rate?: number 
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <div className="text-sm text-gray-600">{label}</div>
        <div className="text-xl font-bold">{value}</div>
      </div>
      {rate !== undefined && (
        <div className="text-sm text-gray-500">
          {rate.toFixed(1)}%
        </div>
      )}
    </div>
  )
}






































