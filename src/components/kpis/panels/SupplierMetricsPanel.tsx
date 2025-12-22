/**
 * Panel 5: Supplier Metrics
 */

'use client'

interface SupplierMetric {
  supplier_name: string
  on_time_delivery_rate: number
  accuracy_rate: number
  avg_delay_minutes: number
  score: number
}

export default function SupplierMetricsPanel({ suppliers }: { suppliers: SupplierMetric[] }) {
  if (!suppliers || suppliers.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Supplier Metrics</h2>
        <p className="text-gray-500">No supplier data available</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-lg font-semibold mb-4">Supplier Metrics</h2>
      
      <div className="space-y-4">
        {suppliers.map((supplier) => (
          <div key={supplier.supplier_name} className="border-b last:border-b-0 pb-4 last:pb-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">{supplier.supplier_name}</h3>
              <div className="text-sm font-bold text-blue-600">
                Score: {supplier.score.toFixed(0)}/100
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <div className="text-xs text-gray-500">On-Time Deliveries</div>
                <div className={`font-medium ${supplier.on_time_delivery_rate >= 85 ? 'text-green-600' : supplier.on_time_delivery_rate >= 70 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {supplier.on_time_delivery_rate.toFixed(0)}%
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Accuracy Rate</div>
                <div className="font-medium">{supplier.accuracy_rate.toFixed(0)}%</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Avg Delay</div>
                <div className="font-medium">
                  {supplier.avg_delay_minutes > 0 ? `${supplier.avg_delay_minutes} min` : 'On time'}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}






































