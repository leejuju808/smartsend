import { ProviderPool, Provider } from './providerPool';
import { createSender, SendEmailParams, SendResult, EmailSender } from './senders';

export interface FailoverSenderConfig {
  workspace_id: string;
  max_retries?: number;
  retry_delay_ms?: number;
  enable_failover?: boolean;
}

export interface FailoverSendResult extends SendResult {
  attempts: number;
  providers_tried: string[];
  final_provider: string;
  total_time_ms: number;
}

/**
 * Failover Sender - Automatically tries best provider first, falls back to others
 */
export class FailoverSender {
  private providerPool: ProviderPool;
  private config: FailoverSenderConfig;
  private readonly DEFAULT_MAX_RETRIES = 3;
  private readonly DEFAULT_RETRY_DELAY_MS = 1000;

  constructor(config: FailoverSenderConfig) {
    this.config = {
      max_retries: this.DEFAULT_MAX_RETRIES,
      retry_delay_ms: this.DEFAULT_RETRY_DELAY_MS,
      enable_failover: true,
      ...config
    };
    this.providerPool = new ProviderPool({ workspace_id: config.workspace_id });
  }

  /**
   * Send email with automatic failover
   */
  async sendWithFailover(params: SendEmailParams): Promise<FailoverSendResult> {
    const startTime = Date.now();
    const providersTried: string[] = [];
    let attempts = 0;
    let lastError: string | undefined;

    // Get the best available provider
    let currentProvider = await this.providerPool.getBestProvider();
    
    if (!currentProvider) {
      return {
        success: false,
        error: 'No available providers',
        provider: 'none',
        attempts: 0,
        providers_tried: [],
        final_provider: 'none',
        total_time_ms: Date.now() - startTime
      };
    }

    while (attempts < this.config.max_retries! && currentProvider) {
      attempts++;
      providersTried.push(currentProvider.name);

      try {
        console.log(`[Failover] Attempt ${attempts}: Trying ${currentProvider.name} (${currentProvider.type})`);
        
        const sender = createSender(currentProvider);
        const result = await sender.send(params);

        if (result.success) {
          // Success! Update provider health and counters
          await this.providerPool.updateProviderHealth(currentProvider.id, true);
          await this.providerPool.incrementProviderCounters(currentProvider.id, true);

          return {
            ...result,
            attempts,
            providers_tried: providersTried,
            final_provider: currentProvider.name,
            total_time_ms: Date.now() - startTime
          };
        } else {
          // Send failed, update provider health and try next provider
          lastError = result.error;
          await this.providerPool.updateProviderHealth(currentProvider.id, false);
          await this.providerPool.incrementProviderCounters(currentProvider.id, false);
          
          console.log(`[Failover] ${currentProvider.name} failed: ${result.error}`);
        }
      } catch (error) {
        // Unexpected error, update provider health and try next provider
        lastError = error instanceof Error ? error.message : 'Unknown error';
        await this.providerPool.updateProviderHealth(currentProvider.id, false);
        await this.providerPool.incrementProviderCounters(currentProvider.id, false);
        
        console.log(`[Failover] ${currentProvider.name} error: ${lastError}`);
      }

      // If failover is disabled, don't try other providers
      if (!this.config.enable_failover) {
        break;
      }

      // Wait before retrying (exponential backoff)
      if (attempts < this.config.max_retries!) {
        const delay = this.config.retry_delay_ms! * Math.pow(2, attempts - 1);
        console.log(`[Failover] Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // Get next best provider
      currentProvider = await this.providerPool.getBestProvider();
    }

    // All attempts failed
    return {
      success: false,
      error: lastError || 'All providers failed',
      provider: 'failover',
      attempts,
      providers_tried: providersTried,
      final_provider: providersTried[providersTried.length - 1] || 'none',
      total_time_ms: Date.now() - startTime
    };
  }

  /**
   * Send email to multiple recipients with failover
   */
  async sendBulkWithFailover(
    params: Omit<SendEmailParams, 'to'>,
    recipients: string[]
  ): Promise<{
    total: number;
    successful: number;
    failed: number;
    results: Array<{ email: string; result: FailoverSendResult }>;
  }> {
    const results: Array<{ email: string; result: FailoverSendResult }> = [];
    let successful = 0;
    let failed = 0;

    console.log(`[Failover] Starting bulk send to ${recipients.length} recipients`);

    for (const email of recipients) {
      try {
        const result = await this.sendWithFailover({
          ...params,
          to: email
        });

        results.push({ email, result });
        
        if (result.success) {
          successful++;
        } else {
          failed++;
        }

        // Small delay between sends to avoid overwhelming providers
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`[Failover] Error sending to ${email}:`, error);
        failed++;
        results.push({
          email,
          result: {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            provider: 'failover',
            attempts: 0,
            providers_tried: [],
            final_provider: 'none',
            total_time_ms: 0
          }
        });
      }
    }

    console.log(`[Failover] Bulk send completed: ${successful} successful, ${failed} failed`);

    return {
      total: recipients.length,
      successful,
      failed,
      results
    };
  }

  /**
   * Test provider connectivity
   */
  async testProvider(providerId: string): Promise<{
    success: boolean;
    response_time_ms: number;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      const provider = await this.providerPool.getProviderById(providerId);
      if (!provider) {
        return {
          success: false,
          response_time_ms: Date.now() - startTime,
          error: 'Provider not found'
        };
      }

      const sender = createSender(provider);
      const testParams: SendEmailParams = {
        to: 'test@example.com',
        from: 'test@example.com',
        subject: 'Provider Test',
        html: '<p>This is a test email to verify provider connectivity.</p>'
      };

      const result = await sender.send(testParams);
      
      return {
        success: result.success,
        response_time_ms: Date.now() - startTime,
        error: result.error
      };
    } catch (error) {
      return {
        success: false,
        response_time_ms: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get failover statistics
   */
  async getFailoverStats(): Promise<{
    total_providers: number;
    healthy_providers: number;
    workspace_capacity: {
      total_daily_cap: number;
      total_minute_cap: number;
      active_providers: number;
    };
  }> {
    const providers = await this.providerPool.getAllProviders();
    const capacity = await this.providerPool.getWorkspaceCapacity();
    
    const healthyProviders = providers.filter(p => p.health_score > 0.7).length;

    return {
      total_providers: providers.length,
      healthy_providers: healthyProviders,
      workspace_capacity: capacity
    };
  }
} 