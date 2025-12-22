'use client'

import { useEffect, useState } from 'react'
import { MeshProtocol } from '@/lib/aurev3/mesh-protocol'
import { CreditSystem } from '@/lib/aurev3/credit-system'

interface NetworkStats {
  totalNodes: number
  activeNodes: number
  totalAgents: number
  totalDecisionsToday: number
  averageAccuracy: number
  nodeTypes: Record<string, number>
}

interface CreditBalance {
  balance: number
  lifetimeEarned: number
  lifetimeSpent: number
}

export default function AUREV3Dashboard() {
  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null)
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboard()
    // Refresh every 30 seconds
    const interval = setInterval(loadDashboard, 30000)
    return () => clearInterval(interval)
  }, [])

  async function loadDashboard() {
    try {
      // Fetch network stats
      const statsRes = await fetch('/api/mesh/stats')
      if (statsRes.ok) {
        const { stats } = await statsRes.json()
        setNetworkStats(stats)
      }

      // Fetch credit balance
      const creditsRes = await fetch('/api/aurev3/credits/balance')
      if (creditsRes.ok) {
        const { balance } = await creditsRes.json()
        setCreditBalance(balance)
      }
    } catch (error) {
      console.error('Error loading dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black to-gray-950 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-8">
            <div className="h-12 bg-gray-800 rounded"></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-32 bg-gray-800 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-gray-950 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-yellow-500 to-yellow-600 bg-clip-text text-transparent">
              AUREV 3.0 Network
            </h1>
            <p className="text-gray-400 mt-2">
              Global Federated Intelligence Layer
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-400">Network Status</div>
            <div className="text-2xl font-bold text-green-500">
              {networkStats?.activeNodes || 0} / {networkStats?.totalNodes || 0} Active
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Total Nodes */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <div className="text-sm text-gray-400 mb-2">Total Nodes</div>
            <div className="text-3xl font-bold text-yellow-500">
              {networkStats?.totalNodes || 0}
            </div>
            <div className="text-xs text-gray-500 mt-2">
              Connected organizations
            </div>
          </div>

          {/* Active Agents */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <div className="text-sm text-gray-400 mb-2">Active Agents</div>
            <div className="text-3xl font-bold text-blue-500">
              {networkStats?.totalAgents || 0}
            </div>
            <div className="text-xs text-gray-500 mt-2">
              Edge agents executing
            </div>
          </div>

          {/* Decisions Today */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <div className="text-sm text-gray-400 mb-2">Decisions Today</div>
            <div className="text-3xl font-bold text-green-500">
              {networkStats?.totalDecisionsToday.toLocaleString() || 0}
            </div>
            <div className="text-xs text-gray-500 mt-2">
              AI decisions executed
            </div>
          </div>

          {/* Average Accuracy */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <div className="text-sm text-gray-400 mb-2">Avg Accuracy</div>
            <div className="text-3xl font-bold text-purple-500">
              {networkStats ? (networkStats.averageAccuracy * 100).toFixed(1) : 0}%
            </div>
            <div className="text-xs text-gray-500 mt-2">
              Global model performance
            </div>
          </div>
        </div>

        {/* Credit Balance */}
        {creditBalance && (
          <div className="bg-gradient-to-r from-yellow-500/10 to-yellow-600/10 border border-yellow-500/20 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-400 mb-1">AUREV Credits</div>
                <div className="text-4xl font-bold text-yellow-500">
                  {creditBalance.balance.toFixed(2)}
                </div>
              </div>
              <div className="text-right space-y-1">
                <div className="text-sm text-gray-400">
                  Lifetime Earned: <span className="text-green-500 font-semibold">{creditBalance.lifetimeEarned.toFixed(2)}</span>
                </div>
                <div className="text-sm text-gray-400">
                  Lifetime Spent: <span className="text-red-500 font-semibold">{creditBalance.lifetimeSpent.toFixed(2)}</span>
                </div>
              </div>
            </div>
            <div className="mt-4">
              <a
                href="/aurev3/credits"
                className="inline-block px-4 py-2 bg-yellow-500 text-black rounded-lg font-semibold hover:bg-yellow-600 transition"
              >
                Purchase Credits
              </a>
            </div>
          </div>
        )}

        {/* Node Types Breakdown */}
        {networkStats && (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-bold text-gray-200 mb-4">Node Types</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(networkStats.nodeTypes).map(([type, count]) => (
                <div key={type} className="text-center">
                  <div className="text-2xl font-bold text-yellow-500">{count}</div>
                  <div className="text-sm text-gray-400 capitalize">{type}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold text-gray-200 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <a
              href="/aurev3/nodes"
              className="px-4 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-center transition"
            >
              <div className="font-semibold text-gray-200">View Nodes</div>
              <div className="text-sm text-gray-400 mt-1">Manage mesh nodes</div>
            </a>
            <a
              href="/aurev3/agents"
              className="px-4 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-center transition"
            >
              <div className="font-semibold text-gray-200">Edge Agents</div>
              <div className="text-sm text-gray-400 mt-1">Deploy & manage agents</div>
            </a>
            <a
              href="/aurev3/governance"
              className="px-4 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-center transition"
            >
              <div className="font-semibold text-gray-200">Governance</div>
              <div className="text-sm text-gray-400 mt-1">DAO & policies</div>
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}







