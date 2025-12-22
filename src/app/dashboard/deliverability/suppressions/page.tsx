"use client"
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

interface Suppression {
  id: string;
  kind: string;
  value_lower: string;
  reason?: string;
  source?: string;
  created_at: string;
  campaign_name?: string;
  auto_stop_count: number;
}

export default function SuppressionsPage() {
  const [suppressions, setSuppressions] = useState<Suppression[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState({
    total: 0,
    bySource: {} as Record<string, number>,
    byKind: {} as Record<string, number>
  })
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    const active = localStorage.getItem('active_workspace')
    if (!active) { 
      setError('No workspace selected'); 
      setLoading(false); 
      return 
    }
    
    fetchSuppressions(active)
    fetchStats(active)
  }, [])

  async function fetchSuppressions(workspaceId: string) {
    try {
      const response = await fetch(`/api/deliverability/suppressions?workspaceId=${workspaceId}`)
      const data = await response.json()
      
      if (data.success) {
        setSuppressions(data.suppressions || [])
      } else {
        setError(data.error || 'Failed to fetch suppressions')
      }
    } catch (error) {
      setError('Failed to fetch suppressions')
    } finally {
      setLoading(false)
    }
  }

  async function fetchStats(workspaceId: string) {
    try {
      const response = await fetch(`/api/deliverability/suppressions/stats?workspaceId=${workspaceId}`)
      const data = await response.json()
      
      if (data.success) {
        setStats(data.stats)
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }

  function getSourceColor(source: string) {
    switch (source) {
      case 'bounce': return 'bg-red-100 text-red-800'
      case 'complaint': return 'bg-orange-100 text-orange-800'
      case 'unsubscribe': return 'bg-blue-100 text-blue-800'
      case 'manual': return 'bg-gray-100 text-gray-800'
      case 'reply_stop': return 'bg-purple-100 text-purple-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  function getSourceIcon(source: string) {
    switch (source) {
      case 'bounce': return '📧'
      case 'complaint': return '⚠️'
      case 'unsubscribe': return '🚫'
      case 'manual': return '✋'
      case 'reply_stop': return '🔄'
      default: return '📋'
    }
  }

  function getKindLabel(kind: string) {
    switch (kind) {
      case 'email': return 'Email Address'
      case 'domain': return 'Domain'
      default: return kind
    }
  }

  const filteredSuppressions = filter === 'all' 
    ? suppressions 
    : suppressions.filter(s => s.source === filter)

  if (loading) return (
    <div className="flex items-center justify-center p-8">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      <span className="ml-2">Loading suppressions...</span>
    </div>
  )
  
  if (error) return (
    <div className="p-6">
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex">
          <div className="text-red-400">⚠️</div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error</h3>
            <div className="mt-2 text-sm text-red-700">{error}</div>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Email Suppressions</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage bounced, complained, and unsubscribed email addresses
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          <div className="text-sm text-gray-500">Total Suppressions</div>
        </div>
        {Object.entries(stats.bySource).map(([source, count]) => (
          <div key={source} className="bg-white p-4 rounded-lg border">
            <div className="text-2xl font-bold text-gray-900">{count}</div>
            <div className="text-sm text-gray-500 capitalize">{source.replace('_', ' ')}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg border">
        <div className="flex items-center space-x-4">
          <span className="text-sm font-medium text-gray-700">Filter by source:</span>
          <div className="flex space-x-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 text-sm rounded ${
                filter === 'all' 
                  ? 'bg-blue-100 text-blue-800' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('bounce')}
              className={`px-3 py-1 text-sm rounded ${
                filter === 'bounce' 
                  ? 'bg-red-100 text-red-800' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Bounces
            </button>
            <button
              onClick={() => setFilter('complaint')}
              className={`px-3 py-1 text-sm rounded ${
                filter === 'complaint' 
                  ? 'bg-orange-100 text-orange-800' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Complaints
            </button>
            <button
              onClick={() => setFilter('unsubscribe')}
              className={`px-3 py-1 text-sm rounded ${
                filter === 'unsubscribe' 
                  ? 'bg-blue-100 text-blue-800' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Unsubscribes
            </button>
            <button
              onClick={() => setFilter('manual')}
              className={`px-3 py-1 text-sm rounded ${
                filter === 'manual' 
                  ? 'bg-gray-100 text-gray-800' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Manual
            </button>
          </div>
        </div>
      </div>

      {/* Suppressions List */}
      <div className="bg-white rounded-lg border">
        <div className="px-4 py-3 border-b font-medium">
          Suppressions ({filteredSuppressions.length})
        </div>
        {filteredSuppressions.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <div className="text-4xl mb-4">📋</div>
            <p>No suppressions found</p>
            <p className="text-sm">
              {filter === 'all' 
                ? 'Suppressions will appear here as they are added'
                : `No ${filter} suppressions found`
              }
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {filteredSuppressions.map((suppression) => (
              <li key={suppression.id} className="px-4 py-4 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getSourceColor(suppression.source || 'unknown')}`}>
                        {getSourceIcon(suppression.source || 'unknown')} {suppression.source?.replace('_', ' ') || 'unknown'}
                      </span>
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        {getKindLabel(suppression.kind)}
                      </span>
                    </div>
                    
                    <div className="font-medium text-gray-900 mb-1">
                      {suppression.value_lower}
                    </div>
                    
                    {suppression.reason && (
                      <div className="text-sm text-gray-600 mb-1">
                        Reason: {suppression.reason}
                      </div>
                    )}
                    
                    {suppression.campaign_name && (
                      <div className="text-xs text-blue-600 mb-1">
                        Campaign: {suppression.campaign_name}
                      </div>
                    )}
                    
                    {suppression.auto_stop_count > 0 && (
                      <div className="text-xs text-purple-600">
                        Auto-stopped {suppression.auto_stop_count} sequence(s)
                      </div>
                    )}
                  </div>
                  
                  <div className="ml-4 text-right text-xs text-gray-500">
                    <div>{new Date(suppression.created_at).toLocaleDateString()}</div>
                    <div>{new Date(suppression.created_at).toLocaleTimeString()}</div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-medium text-gray-900 mb-2">Quick Actions</h3>
        <div className="flex space-x-2">
          <button 
            onClick={() => window.location.reload()}
            className="px-3 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50"
          >
            Refresh
          </button>
          <button 
            onClick={() => {/* TODO: Add bulk import */}}
            className="px-3 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50"
          >
            Import Suppressions
          </button>
          <button 
            onClick={() => {/* TODO: Add export */}}
            className="px-3 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50"
          >
            Export
          </button>
        </div>
      </div>
    </div>
  )
} 