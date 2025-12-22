'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, AlertCircle, Info, X } from 'lucide-react'

interface RiskAlertsCardProps {
  workspaceId: string
}

interface Risk {
  id: string
  category: string
  insight: string
  severity: 'info' | 'warning' | 'critical'
  metadata: any
  created_at: string
}

export function RiskAlertsCard({ workspaceId }: RiskAlertsCardProps) {
  const [risks, setRisks] = useState<Risk[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchRisks()
    // Refresh every 5 minutes
    const interval = setInterval(fetchRisks, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [workspaceId])

  const fetchRisks = async () => {
    try {
      const response = await fetch(`/api/owner/risks?workspace_id=${workspaceId}`)
      const data = await response.json()
      if (data.error) {
        console.error('Risks error:', data.error)
      } else {
        setRisks(data.risks || [])
      }
    } catch (error) {
      console.error('Failed to fetch risks:', error)
    } finally {
      setLoading(false)
    }
  }

  const acknowledgeRisk = async (riskId: string) => {
    try {
      await fetch('/api/owner/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          insight_id: riskId,
          acknowledged: true,
        }),
      })
      setRisks(risks.filter(r => r.id !== riskId))
    } catch (error) {
      console.error('Failed to acknowledge risk:', error)
    }
  }

  if (loading) {
    return (
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-zinc-800 rounded w-1/3"></div>
          <div className="h-4 bg-zinc-800 rounded w-2/3"></div>
        </div>
      </div>
    )
  }

  const criticalRisks = risks.filter(r => r.severity === 'critical')
  const warnings = risks.filter(r => r.severity === 'warning')
  const info = risks.filter(r => r.severity === 'info')

  if (risks.length === 0) {
    return (
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <AlertCircle className="w-5 h-5 text-green-400" />
          <h3 className="text-lg font-semibold text-white">Risk Alerts</h3>
        </div>
        <p className="text-zinc-400">No risks detected. All systems operating normally.</p>
      </div>
    )
  }

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <h3 className="text-lg font-semibold text-white">Risk Alerts</h3>
        </div>
        <div className="text-sm text-zinc-400">
          {risks.length} active {risks.length === 1 ? 'alert' : 'alerts'}
        </div>
      </div>

      <div className="space-y-3">
        {/* Critical Risks */}
        {criticalRisks.map(risk => (
          <div
            key={risk.id}
            className="bg-red-500/10 border border-red-500/30 rounded-lg p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1">
                <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-xs text-red-400 font-medium mb-1 uppercase">
                    Critical - {risk.category}
                  </div>
                  <div className="text-white text-sm">{risk.insight}</div>
                </div>
              </div>
              <button
                onClick={() => acknowledgeRisk(risk.id)}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}

        {/* Warnings */}
        {warnings.map(risk => (
          <div
            key={risk.id}
            className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1">
                <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-xs text-yellow-400 font-medium mb-1 uppercase">
                    Warning - {risk.category}
                  </div>
                  <div className="text-white text-sm">{risk.insight}</div>
                </div>
              </div>
              <button
                onClick={() => acknowledgeRisk(risk.id)}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}

        {/* Info */}
        {info.slice(0, 3).map(risk => (
          <div
            key={risk.id}
            className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1">
                <Info className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-xs text-blue-400 font-medium mb-1 uppercase">
                    Info - {risk.category}
                  </div>
                  <div className="text-white text-sm">{risk.insight}</div>
                </div>
              </div>
              <button
                onClick={() => acknowledgeRisk(risk.id)}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

























