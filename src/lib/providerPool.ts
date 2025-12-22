import { supabaseAdmin } from '@/server/supabase';

export interface Provider {
  id: string;
  name: string;
  type: 'ses' | 'mailgun' | 'mailersend' | 'smtp';
  config: Record<string, any>;
  weight: number;
  health_score: number;
  daily_cap: number;
  minute_cap: number;
  enabled: boolean;
}

export interface ProviderPoolConfig {
  workspace_id: string;
  max_retries?: number;
  retry_delay_ms?: number;
}

/**
 * Provider Pool - Manages provider selection, health scoring, and failover
 */
export class ProviderPool {
  private config: ProviderPoolConfig;
  private providers: Provider[] = [];
  private lastRefresh: number = 0;
  private readonly REFRESH_INTERVAL_MS = 30000; // 30 seconds

  constructor(config: ProviderPoolConfig) {
    this.config = config;
  }

  /**
   * Get the current provider pool from database
   */
  private async refreshProviders(): Promise<void> {
    const now = Date.now();
    if (now - this.lastRefresh < this.REFRESH_INTERVAL_MS) {
      return; // Use cached providers
    }

    try {
      const { data, error } = await supabaseAdmin
        .rpc('get_provider_pool', { workspace_id_param: this.config.workspace_id });

      if (error) {
        console.error('Error fetching provider pool:', error);
        return;
      }

      this.providers = data || [];
      this.lastRefresh = now;
    } catch (error) {
      console.error('Error refreshing provider pool:', error);
    }
  }

  /**
   * Get the best available provider for sending
   */
  async getBestProvider(): Promise<Provider | null> {
    await this.refreshProviders();

    if (this.providers.length === 0) {
      return null;
    }

    // Sort by health score * weight (highest first)
    const sortedProviders = [...this.providers].sort((a, b) => 
      (b.health_score * b.weight) - (a.health_score * a.weight)
    );

    // Find first provider that can send
    for (const provider of sortedProviders) {
      const canSend = await this.canProviderSend(provider.id);
      if (canSend) {
        return provider;
      }
    }

    return null;
  }

  /**
   * Check if a provider can send (respecting caps)
   */
  async canProviderSend(providerId: string): Promise<boolean> {
    try {
      const { data, error } = await supabaseAdmin
        .rpc('can_provider_send', { provider_id_param: providerId });

      if (error) {
        console.error('Error checking provider send capability:', error);
        return false;
      }

      return data || false;
    } catch (error) {
      console.error('Error checking provider send capability:', error);
      return false;
    }
  }

  /**
   * Get all available providers (for UI display)
   */
  async getAllProviders(): Promise<Provider[]> {
    await this.refreshProviders();
    return [...this.providers];
  }

  /**
   * Get provider by ID
   */
  async getProviderById(providerId: string): Promise<Provider | null> {
    await this.refreshProviders();
    return this.providers.find(p => p.id === providerId) || null;
  }

  /**
   * Update provider health score after send attempt
   */
  async updateProviderHealth(providerId: string, success: boolean): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .rpc('update_provider_health', { 
          provider_id_param: providerId, 
          success 
        });

      if (error) {
        console.error('Error updating provider health:', error);
      }
    } catch (error) {
      console.error('Error updating provider health:', error);
    }
  }

  /**
   * Increment provider counters after send attempt
   */
  async incrementProviderCounters(providerId: string, success: boolean): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .rpc('increment_provider_counters', { 
          provider_id_param: providerId, 
          success 
        });

      if (error) {
        console.error('Error incrementing provider counters:', error);
      }
    } catch (error) {
      console.error('Error incrementing provider counters:', error);
    }
  }

  /**
   * Get provider statistics
   */
  async getProviderStats(providerId: string, days: number = 7): Promise<{
    total_sent: number;
    total_success: number;
    total_failure: number;
    success_rate: number;
  } | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('provider_counters')
        .select('sent_count, success_count, failure_count')
        .eq('provider_id', providerId)
        .gte('date', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

      if (error) {
        console.error('Error fetching provider stats:', error);
        return null;
      }

      const stats = data?.reduce((acc, counter) => ({
        sent_count: acc.sent_count + counter.sent_count,
        success_count: acc.success_count + counter.success_count,
        failure_count: acc.failure_count + counter.failure_count,
      }), { sent_count: 0, success_count: 0, failure_count: 0 });

      if (!stats) return null;

      return {
        total_sent: stats.sent_count,
        total_success: stats.success_count,
        total_failure: stats.failure_count,
        success_rate: stats.sent_count > 0 ? stats.success_count / stats.sent_count : 0
      };
    } catch (error) {
      console.error('Error fetching provider stats:', error);
      return null;
    }
  }

  /**
   * Get workspace sending capacity (sum of all provider daily caps)
   */
  async getWorkspaceCapacity(): Promise<{
    total_daily_cap: number;
    total_minute_cap: number;
    active_providers: number;
  }> {
    await this.refreshProviders();

    const totalDailyCap = this.providers.reduce((sum, p) => sum + p.daily_cap, 0);
    const totalMinuteCap = this.providers.reduce((sum, p) => sum + p.minute_cap, 0);
    const activeProviders = this.providers.length; // All providers in pool are already filtered as enabled

    return {
      total_daily_cap: totalDailyCap,
      total_minute_cap: totalMinuteCap,
      active_providers: activeProviders
    };
  }
} 