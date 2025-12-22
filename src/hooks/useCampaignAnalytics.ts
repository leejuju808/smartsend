import { useState, useEffect } from 'react'
import { CampaignAnalyticsService, CampaignMetrics } from '@/lib/campaignAnalytics'

export interface CampaignAnalytics {
  stats: CampaignMetrics
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useCampaignAnalytics(campaignId?: string): CampaignAnalytics {
  const [stats, setStats] = useState<CampaignMetrics>({ 
    sent: 0, 
    opened: 0, 
    replied: 0,
    clicked: 0,
    bounced: 0,
    unsubscribed: 0
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const result = campaignId 
        ? await CampaignAnalyticsService.getCampaignAnalytics(campaignId)
        : await CampaignAnalyticsService.getAggregatedAnalytics()
      
      const stats = campaignId && result && 'metrics' in result
        ? result.metrics 
        : result as CampaignMetrics
      
      setStats(stats)
    } catch (err) {
      console.error("Error fetching campaign analytics:", err)
      setError(err instanceof Error ? err.message : "An unexpected error occurred")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [campaignId])

  return {
    stats,
    loading,
    error,
    refresh: fetchStats
  }
}