'use client'

import { useEffect, useState } from 'react'
import { OwnerQueryInterface } from '@/components/owner-mode/OwnerQueryInterface'
import { DailyBriefingCard } from '@/components/owner-mode/DailyBriefingCard'
import { ForecastCard } from '@/components/owner-mode/ForecastCard'
import { RiskAlertsCard } from '@/components/owner-mode/RiskAlertsCard'
import { createClient } from '@/lib/supabase/client'
import { Brain, TrendingUp, AlertTriangle, Lightbulb } from 'lucide-react'

export default function AIAssistantPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function getWorkspace() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user) {
        // Get user's primary workspace
        const { data: workspaces } = await supabase
          .from('workspace_members')
          .select('workspace_id')
          .eq('user_id', user.id)
          .limit(1)
          .single()

        if (workspaces) {
          setWorkspaceId(workspaces.workspace_id)
        }
      }
      setLoading(false)
    }

    getWorkspace()
  }, [])

  if (loading || !workspaceId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Brain className="w-8 h-8 text-emerald-400" />
          <h1 className="text-3xl font-bold text-white">AI Company Assistant</h1>
        </div>
        <p className="text-zinc-400">
          Your AI COO + AI CFO + AI Advisor. Get instant answers, forecasts, and strategic insights.
        </p>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Daily Briefing */}
          <DailyBriefingCard workspaceId={workspaceId} />

          {/* Forecast */}
          <ForecastCard workspaceId={workspaceId} />
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Risk Alerts */}
          <RiskAlertsCard workspaceId={workspaceId} />

          {/* Query Interface */}
          <OwnerQueryInterface workspaceId={workspaceId} />
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <h3 className="font-semibold text-white">Forecasting</h3>
          </div>
          <p className="text-sm text-zinc-400">
            Revenue, cashflow, and workload predictions for the next 30/60/90 days
          </p>
        </div>

        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle className="w-5 h-5 text-yellow-400" />
            <h3 className="font-semibold text-white">Risk Detection</h3>
          </div>
          <p className="text-sm text-zinc-400">
            Early warnings for overdue jobs, low margins, crew issues, and cashflow risks
          </p>
        </div>

        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <Lightbulb className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-white">Optimization</h3>
          </div>
          <p className="text-sm text-zinc-400">
            AI-powered suggestions for pricing, crew allocation, and marketing optimization
          </p>
        </div>
      </div>
    </div>
  )
}

























