'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Minus, DollarSign, Calendar, Users } from 'lucide-react'

interface ForecastCardProps {
  workspaceId: string
}

interface ForecastData {
  revenue: {
    next30Days: number
    next60Days: number
    next90Days: number
    trend: 'up' | 'down' | 'stable'
  }
  cashflow: {
    next30Days: number
    next60Days: number
    next90Days: number
    riskLevel: 'low' | 'medium' | 'high'
  }
  workload: {
    backlogDays: number
    capacityUtilization: number
    projectedCompletion: string
  }
  leads: {
    next30Days: number
    trend: 'up' | 'down' | 'stable'
  }
}

export function ForecastCard({ workspaceId }: ForecastCardProps) {
  const [forecast, setForecast] = useState<ForecastData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchForecast()
  }, [workspaceId])

  const fetchForecast = async () => {
    try {
      const response = await fetch(`/api/owner/forecast?workspace_id=${workspaceId}`)
      const data = await response.json()
      if (data.error) {
        console.error('Forecast error:', data.error)
      } else {
        setForecast(data)
      }
    } catch (error) {
      console.error('Failed to fetch forecast:', error)
    } finally {
      setLoading(false)
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

  if (!forecast) {
    return null
  }

  const TrendIcon = forecast.revenue.trend === 'up' ? TrendingUp 
    : forecast.revenue.trend === 'down' ? TrendingDown 
    : Minus

  const riskColor = forecast.cashflow.riskLevel === 'high' ? 'text-red-400'
    : forecast.cashflow.riskLevel === 'medium' ? 'text-yellow-400'
    : 'text-green-400'

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-6">
        <TrendingUp className="w-5 h-5 text-emerald-400" />
        <h3 className="text-lg font-semibold text-white">AI Forecast</h3>
      </div>

      <div className="space-y-6">
        {/* Revenue Forecast */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-zinc-300">Revenue Forecast</h4>
            <div className="flex items-center gap-1">
              <TrendIcon className={`w-4 h-4 ${
                forecast.revenue.trend === 'up' ? 'text-green-400' 
                : forecast.revenue.trend === 'down' ? 'text-red-400' 
                : 'text-zinc-400'
              }`} />
              <span className="text-xs text-zinc-400 capitalize">{forecast.revenue.trend}</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-zinc-800/50 rounded-lg p-3">
              <div className="text-xs text-zinc-400 mb-1">30 Days</div>
              <div className="text-lg font-semibold text-white">
                ${(forecast.revenue.next30Days / 1000).toFixed(0)}k
              </div>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-3">
              <div className="text-xs text-zinc-400 mb-1">60 Days</div>
              <div className="text-lg font-semibold text-white">
                ${(forecast.revenue.next60Days / 1000).toFixed(0)}k
              </div>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-3">
              <div className="text-xs text-zinc-400 mb-1">90 Days</div>
              <div className="text-lg font-semibold text-white">
                ${(forecast.revenue.next90Days / 1000).toFixed(0)}k
              </div>
            </div>
          </div>
        </div>

        {/* Cashflow */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-zinc-300">Cashflow</h4>
            <span className={`text-xs font-medium ${riskColor} capitalize`}>
              {forecast.cashflow.riskLevel} Risk
            </span>
          </div>
          <div className="bg-zinc-800/50 rounded-lg p-3">
            <div className="text-sm text-zinc-300">
              Next 30 days: <span className="font-semibold text-white">
                ${(forecast.cashflow.next30Days / 1000).toFixed(0)}k
              </span>
            </div>
          </div>
        </div>

        {/* Workload */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-zinc-300">Workload</h4>
            <Users className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="space-y-2">
            <div className="bg-zinc-800/50 rounded-lg p-3">
              <div className="text-sm text-zinc-300 mb-1">
                Backlog: <span className="font-semibold text-white">{forecast.workload.backlogDays} days</span>
              </div>
              <div className="text-xs text-zinc-400">
                Capacity: {forecast.workload.capacityUtilization.toFixed(0)}%
              </div>
            </div>
          </div>
        </div>

        {/* Leads */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-zinc-300">Lead Forecast</h4>
            <div className="flex items-center gap-1">
              {forecast.leads.trend === 'up' && <TrendingUp className="w-4 h-4 text-green-400" />}
              {forecast.leads.trend === 'down' && <TrendingDown className="w-4 h-4 text-red-400" />}
              {forecast.leads.trend === 'stable' && <Minus className="w-4 h-4 text-zinc-400" />}
            </div>
          </div>
          <div className="bg-zinc-800/50 rounded-lg p-3">
            <div className="text-sm text-zinc-300">
              Expected next 30 days: <span className="font-semibold text-white">{forecast.leads.next30Days}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

























