'use client'

import { useState, useEffect } from 'react'
import { Bell, AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react'

interface PredictiveAlertsPanelProps {
  workspaceId: string
  companyId?: string
}

export function PredictiveAlertsPanel({ workspaceId, companyId }: PredictiveAlertsPanelProps) {
  const [alerts, setAlerts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Fetch alerts from database
    fetch(`/api/reports/alerts?workspace_id=${workspaceId}${companyId ? `&company_id=${companyId}` : ''}`)
      .then(r => r.json())
      .then(data => {
        setAlerts(data.alerts || [])
        setLoading(false)
      })
      .catch(err => {
        console.error('Error loading alerts:', err)
        setLoading(false)
      })
  }, [workspaceId, companyId])

  const unacknowledgedAlerts = alerts.filter(a => !a.is_acknowledged && !a.is_resolved)
  const criticalAlerts = unacknowledgedAlerts.filter(a => a.severity === 'critical' || a.severity === 'high')

  return (
    <div className="bg-gradient-to-br from-orange-50 to-red-50 border border-orange-200 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-orange-600" />
          <h3 className="text-lg font-semibold text-gray-900">Predictive Alerts</h3>
        </div>
        {criticalAlerts.length > 0 && (
          <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
            {criticalAlerts.length}
          </span>
        )}
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading alerts...</div>
      ) : unacknowledgedAlerts.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
          <p>No active alerts</p>
        </div>
      ) : (
        <div className="space-y-3">
          {unacknowledgedAlerts.slice(0, 5).map((alert) => {
            const severityColors = {
              critical: 'border-red-500 bg-red-50',
              high: 'border-orange-500 bg-orange-50',
              medium: 'border-yellow-500 bg-yellow-50',
              low: 'border-blue-500 bg-blue-50',
            }

            return (
              <div
                key={alert.id}
                className={`bg-white rounded-lg p-4 border-l-4 ${severityColors[alert.severity as keyof typeof severityColors] || 'border-gray-500'}`}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                    alert.severity === 'critical' ? 'text-red-600' :
                    alert.severity === 'high' ? 'text-orange-600' :
                    'text-yellow-600'
                  }`} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-medium text-gray-900">{alert.title}</p>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                        alert.severity === 'critical' ? 'bg-red-100 text-red-700' :
                        alert.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {alert.severity}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700">{alert.message}</p>
                    {alert.predicted_date && (
                      <p className="text-xs text-gray-500 mt-1">
                        Predicted: {new Date(alert.predicted_date).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

























