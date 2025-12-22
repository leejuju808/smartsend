import { supabase } from '@/lib/supabaseClient'

export interface CampaignMetrics {
  sent: number
  opened: number
  replied: number
  clicked: number
  bounced: number
  unsubscribed: number
}

export interface CampaignAnalyticsData {
  campaignId: string
  campaignName: string
  metrics: CampaignMetrics
  rates: {
    openRate: number
    replyRate: number
    clickRate: number
    bounceRate: number
    unsubscribeRate: number
  }
  sentAt: string
}

export class CampaignAnalyticsService {
  /**
   * Get analytics for all campaigns for the current user
   */
  static async getAllCampaignAnalytics(): Promise<CampaignAnalyticsData[]> {
    try {
      const { data: campaigns, error } = await supabase
        .from('campaigns')
        .select(`
          id,
          name,
          sent_at,
          campaign_stats (
            sent,
            opened,
            replied,
            clicked,
            bounced,
            unsubscribed
          )
        `)
        .order('sent_at', { ascending: false })

      if (error) throw error

      return campaigns?.map(campaign => {
        const stats = campaign.campaign_stats || {
          sent: 0,
          opened: 0,
          replied: 0,
          clicked: 0,
          bounced: 0,
          unsubscribed: 0
        }

        const rates = this.calculateRates(stats)

        return {
          campaignId: campaign.id,
          campaignName: campaign.name,
          metrics: stats,
          rates,
          sentAt: campaign.sent_at
        }
      }) || []
    } catch (error) {
      console.error('Error fetching campaign analytics:', error)
      throw error
    }
  }

  /**
   * Get analytics for a specific campaign
   */
  static async getCampaignAnalytics(campaignId: string): Promise<CampaignAnalyticsData | null> {
    try {
      const { data: campaign, error } = await supabase
        .from('campaigns')
        .select(`
          id,
          name,
          sent_at,
          campaign_stats (
            sent,
            opened,
            replied,
            clicked,
            bounced,
            unsubscribed
          )
        `)
        .eq('id', campaignId)
        .single()

      if (error) throw error
      if (!campaign) return null

      const stats = campaign.campaign_stats || {
        sent: 0,
        opened: 0,
        replied: 0,
        clicked: 0,
        bounced: 0,
        unsubscribed: 0
      }

      const rates = this.calculateRates(stats)

      return {
        campaignId: campaign.id,
        campaignName: campaign.name,
        metrics: stats,
        rates,
        sentAt: campaign.sent_at
      }
    } catch (error) {
      console.error('Error fetching campaign analytics:', error)
      throw error
    }
  }

  /**
   * Get aggregated analytics across all campaigns
   */
  static async getAggregatedAnalytics(): Promise<CampaignMetrics> {
    try {
      const { data: stats, error } = await supabase
        .from('campaign_stats')
        .select('sent, opened, replied, clicked, bounced, unsubscribed')

      if (error) throw error

      const aggregated = stats?.reduce((acc, stat) => ({
        sent: acc.sent + (stat.sent || 0),
        opened: acc.opened + (stat.opened || 0),
        replied: acc.replied + (stat.replied || 0),
        clicked: acc.clicked + (stat.clicked || 0),
        bounced: acc.bounced + (stat.bounced || 0),
        unsubscribed: acc.unsubscribed + (stat.unsubscribed || 0)
      }), {
        sent: 0,
        opened: 0,
        replied: 0,
        clicked: 0,
        bounced: 0,
        unsubscribed: 0
      }) || {
        sent: 0,
        opened: 0,
        replied: 0,
        clicked: 0,
        bounced: 0,
        unsubscribed: 0
      }

      return aggregated
    } catch (error) {
      console.error('Error fetching aggregated analytics:', error)
      throw error
    }
  }

  /**
   * Calculate rates from metrics
   */
  static calculateRates(metrics: CampaignMetrics) {
    const { sent, opened, replied, clicked, bounced, unsubscribed } = metrics
    
    return {
      openRate: sent > 0 ? (opened / sent) * 100 : 0,
      replyRate: sent > 0 ? (replied / sent) * 100 : 0,
      clickRate: sent > 0 ? (clicked / sent) * 100 : 0,
      bounceRate: sent > 0 ? (bounced / sent) * 100 : 0,
      unsubscribeRate: sent > 0 ? (unsubscribed / sent) * 100 : 0
    }
  }

  /**
   * Track email event (open, click, reply, etc.)
   */
  static async trackEmailEvent(
    campaignId: string,
    recipientEmail: string,
    eventType: 'opened' | 'clicked' | 'replied' | 'bounced' | 'unsubscribed',
    metadata?: { ipAddress?: string; userAgent?: string }
  ) {
    try {
      const updateData: any = {
        [`${eventType}_at`]: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      if (metadata?.ipAddress) {
        updateData.ip_address = metadata.ipAddress
      }
      if (metadata?.userAgent) {
        updateData.user_agent = metadata.userAgent
      }

      const { error } = await supabase
        .from('email_tracking')
        .update(updateData)
        .eq('campaign_id', campaignId)
        .eq('recipient_email', recipientEmail)

      if (error) throw error
    } catch (error) {
      console.error('Error tracking email event:', error)
      throw error
    }
  }

  /**
   * Create email tracking record when email is sent
   */
  static async createEmailTracking(
    campaignId: string,
    recipientEmail: string,
    recipientName?: string
  ) {
    try {
      const { error } = await supabase
        .from('email_tracking')
        .insert({
          campaign_id: campaignId,
          recipient_email: recipientEmail,
          recipient_name: recipientName,
          sent_at: new Date().toISOString()
        })

      if (error) throw error
    } catch (error) {
      console.error('Error creating email tracking:', error)
      throw error
    }
  }

  /**
   * Get performance benchmarks
   */
  static getBenchmarks() {
    return {
      openRate: { good: 20, average: 15, poor: 10 },
      replyRate: { good: 5, average: 3, poor: 1 },
      clickRate: { good: 2, average: 1, poor: 0.5 },
      bounceRate: { good: 2, average: 5, poor: 10 }
    }
  }

  /**
   * Evaluate performance against benchmarks
   */
  static evaluatePerformance(rates: ReturnType<typeof CampaignAnalyticsService.calculateRates>) {
    const benchmarks = this.getBenchmarks()
    
    return {
      openRate: this.getPerformanceLevel(rates.openRate, benchmarks.openRate),
      replyRate: this.getPerformanceLevel(rates.replyRate, benchmarks.replyRate),
      clickRate: this.getPerformanceLevel(rates.clickRate, benchmarks.clickRate),
      bounceRate: this.getPerformanceLevel(rates.bounceRate, benchmarks.bounceRate, true) // lower is better for bounce rate
    }
  }

  private static getPerformanceLevel(
    value: number, 
    benchmark: { good: number; average: number; poor: number },
    lowerIsBetter = false
  ): 'excellent' | 'good' | 'average' | 'poor' {
    if (lowerIsBetter) {
      if (value <= benchmark.good) return 'excellent'
      if (value <= benchmark.average) return 'good'
      if (value <= benchmark.poor) return 'average'
      return 'poor'
    } else {
      if (value >= benchmark.good) return 'excellent'
      if (value >= benchmark.average) return 'good'
      if (value >= benchmark.poor) return 'average'
      return 'poor'
    }
  }
}