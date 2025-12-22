import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

export interface UnsubscribeTokenData {
  token: string;
  workspaceId: string;
  contactId?: string;
  campaignId?: string;
  email: string;
  createdAt: Date;
  usedAt?: Date;
  expiresAt: Date;
}

export interface UnsubscribeOptions {
  tokenLength?: number;
  expiresIn?: number; // milliseconds
  includeCampaign?: boolean;
  includeContact?: boolean;
}

export class EnhancedUnsubscribeManager {
  private supabase: any;
  private options: UnsubscribeOptions;

  constructor(options: UnsubscribeOptions = {}) {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    this.options = {
      tokenLength: 32,
      expiresIn: 30 * 24 * 60 * 60 * 1000, // 30 days
      includeCampaign: true,
      includeContact: true,
      ...options,
    };
  }

  /**
   * Generate a unique unsubscribe token
   */
  private generateToken(): string {
    return crypto.randomBytes(this.options.tokenLength! / 2).toString('hex');
  }

  /**
   * Create an unsubscribe token for a specific email
   */
  async createToken(
    workspaceId: string,
    email: string,
    campaignId?: string,
    contactId?: string
  ): Promise<string> {
    const token = this.generateToken();
    const expiresAt = new Date(Date.now() + this.options.expiresIn!);
    
    const tokenData = {
      token,
      workspace_id: workspaceId,
      contact_id: contactId,
      campaign_id: campaignId,
      email_lower: email.toLowerCase(),
      expires_at: expiresAt.toISOString(),
    };

    const { error } = await this.supabase
      .from('unsubscribe_tokens')
      .insert(tokenData);

    if (error) {
      throw new Error(`Failed to create unsubscribe token: ${error.message}`);
    }

    return token;
  }

  /**
   * Create unsubscribe tokens for multiple emails
   */
  async createTokens(
    workspaceId: string,
    emails: string[],
    campaignId?: string,
    contactIds?: string[]
  ): Promise<Record<string, string>> {
    const tokens: Record<string, string> = {};
    
    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      const contactId = contactIds?.[i];
      const token = await this.createToken(workspaceId, email, campaignId, contactId);
      tokens[email] = token;
    }

    return tokens;
  }

  /**
   * Validate and use an unsubscribe token
   */
  async useToken(token: string): Promise<UnsubscribeTokenData | null> {
    // Get token details
    const { data: tokenRecord, error: fetchError } = await this.supabase
      .from('unsubscribe_tokens')
      .select('*')
      .eq('token', token)
      .single();

    if (fetchError || !tokenRecord) {
      return null;
    }

    // Check if token is already used
    if (tokenRecord.used_at) {
      return null;
    }

    // Check if token is expired
    const expiresAt = new Date(tokenRecord.expires_at);
    const now = new Date();
    if (now > expiresAt) {
      return null;
    }

    // Mark token as used
    const { error: updateError } = await this.supabase
      .from('unsubscribe_tokens')
      .update({ used_at: now.toISOString() })
      .eq('token', token);

    if (updateError) {
      throw new Error(`Failed to mark token as used: ${updateError.message}`);
    }

    // Add email to suppressions
    await this.addToSuppressions(
      tokenRecord.workspace_id,
      tokenRecord.email_lower,
      'unsubscribed',
      tokenRecord.campaign_id
    );

    // If this is a campaign-specific unsubscribe, log the event
    if (tokenRecord.campaign_id) {
      await this.logUnsubscribeEvent(
        tokenRecord.workspace_id,
        tokenRecord.contact_id,
        tokenRecord.campaign_id,
        'unsubscribed'
      );
    }

    return {
      token: tokenRecord.token,
      workspaceId: tokenRecord.workspace_id,
      contactId: tokenRecord.contact_id,
      campaignId: tokenRecord.campaign_id,
      email: tokenRecord.email_lower,
      createdAt: new Date(tokenRecord.created_at),
      usedAt: now,
      expiresAt: new Date(tokenRecord.expires_at),
    };
  }

  /**
   * Add email to suppressions list
   */
  private async addToSuppressions(
    workspaceId: string,
    email: string,
    reason: string,
    campaignId?: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('suppressions')
      .upsert({
        workspace_id: workspaceId,
        user_id: null, // Will be set by RLS policy
        kind: 'email',
        value_lower: email.toLowerCase(),
        reason,
        source: 'unsubscribe',
        campaign_id: campaignId,
        metadata: {
          added_via: 'unsubscribe_token',
          timestamp: new Date().toISOString(),
        },
      });

    if (error) {
      console.error('Failed to add to suppressions:', error);
    }
  }

  /**
   * Log unsubscribe event
   */
  private async logUnsubscribeEvent(
    workspaceId: string,
    contactId: string | null,
    campaignId: string,
    reason: string
  ): Promise<void> {
    try {
      await this.supabase
        .from('email_events')
        .insert({
          workspace_id: workspaceId,
          campaign_id: campaignId,
          contact_id: contactId,
          event_type: 'unsubscribed',
          created_at: new Date().toISOString(),
        });
    } catch (error) {
      console.error('Failed to log unsubscribe event:', error);
    }
  }

  /**
   * Generate unsubscribe URL
   */
  generateUnsubscribeUrl(token: string, baseUrl?: string): string {
    const domain = baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return `${domain}/u/${token}`;
  }

  /**
   * Generate mailto unsubscribe link
   */
  generateMailtoUnsubscribe(email: string, subject?: string): string {
    const unsubscribeSubject = subject || 'Unsubscribe';
    const body = `Please unsubscribe me from your mailing list.\n\nEmail: ${email}`;
    
    return `mailto:${email}?subject=${encodeURIComponent(unsubscribeSubject)}&body=${encodeURIComponent(body)}`;
  }

  /**
   * Check if an email is unsubscribed for a specific workspace
   */
  async isUnsubscribed(workspaceId: string, email: string): Promise<boolean> {
    // Check suppressions first
    const { data: suppression } = await this.supabase
      .from('suppressions')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('kind', 'email')
      .eq('value_lower', email.toLowerCase())
      .single();

    if (suppression) {
      return true;
    }

    // Check if there's a used unsubscribe token
    const { data: unsubToken } = await this.supabase
      .from('unsubscribe_tokens')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('email_lower', email.toLowerCase())
      .not('used_at', 'is', null)
      .single();

    return !!unsubToken;
  }

  /**
   * Get all unsubscribed emails for a workspace
   */
  async getUnsubscribedEmails(workspaceId: string): Promise<string[]> {
    const { data: suppressions } = await this.supabase
      .from('suppressions')
      .select('value_lower')
      .eq('workspace_id', workspaceId)
      .eq('kind', 'email');

    const { data: unsubTokens } = await this.supabase
      .from('unsubscribe_tokens')
      .select('email_lower')
      .eq('workspace_id', workspaceId)
      .not('used_at', 'is', null);

    const emails = new Set<string>();
    
    if (suppressions) {
      suppressions.forEach((s: any) => emails.add(s.value_lower));
    }
    
    if (unsubTokens) {
      unsubTokens.forEach((u: any) => emails.add(u.email_lower));
    }

    return Array.from(emails);
  }

  /**
   * Remove email from suppressions (resubscribe)
   */
  async resubscribe(workspaceId: string, email: string): Promise<void> {
    // Remove from suppressions
    await this.supabase
      .from('suppressions')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('kind', 'email')
      .eq('value_lower', email.toLowerCase());

    // Mark unsubscribe tokens as unused (for future use)
    await this.supabase
      .from('unsubscribe_tokens')
      .update({ used_at: null })
      .eq('workspace_id', workspaceId)
      .eq('email_lower', email.toLowerCase());
  }

  /**
   * Clean up expired tokens
   */
  async cleanupExpiredTokens(): Promise<number> {
    try {
      const { data, error } = await this.supabase.rpc('cleanup_expired_unsubscribe_tokens');
      
      if (error) {
        throw new Error(`Failed to cleanup expired tokens: ${error.message}`);
      }

      return data || 0;
    } catch (error) {
      console.error('Error cleaning up expired tokens:', error);
      return 0;
    }
  }

  /**
   * Get unsubscribe statistics for a workspace
   */
  async getStats(workspaceId: string): Promise<{
    total: number;
    used: number;
    unused: number;
    expired: number;
    byCampaign: Record<string, number>;
  }> {
    const cutoffDate = new Date(Date.now() - this.options.expiresIn!);
    
    // Total tokens
    const { count: total } = await this.supabase
      .from('unsubscribe_tokens')
      .select('id', { count: 'exact' })
      .eq('workspace_id', workspaceId);

    // Used tokens
    const { count: used } = await this.supabase
      .from('unsubscribe_tokens')
      .select('id', { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .not('used_at', 'is', null);

    // Expired tokens
    const { count: expired } = await this.supabase
      .from('unsubscribe_tokens')
      .select('id', { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .lt('created_at', cutoffDate.toISOString())
      .is('used_at', null);

    // By campaign
    const { data: campaignStats } = await this.supabase
      .from('unsubscribe_tokens')
      .select('campaign_id, campaigns!inner(name)')
      .eq('workspace_id', workspaceId)
      .not('used_at', 'is', null);

    const byCampaign: Record<string, number> = {};
    if (campaignStats) {
      campaignStats.forEach((item: any) => {
        const campaignName = item.campaigns?.name || 'Unknown';
        byCampaign[campaignName] = (byCampaign[campaignName] || 0) + 1;
      });
    }

    return {
      total: total || 0,
      used: used || 0,
      unused: (total || 0) - (used || 0),
      expired: expired || 0,
      byCampaign,
    };
  }

  /**
   * Bulk unsubscribe emails (for manual suppression)
   */
  async bulkUnsubscribe(
    workspaceId: string,
    emails: string[],
    reason: string = 'manual',
    campaignId?: string
  ): Promise<number> {
    let successCount = 0;

    for (const email of emails) {
      try {
        await this.addToSuppressions(workspaceId, email, reason, campaignId);
        successCount++;
      } catch (error) {
        console.error(`Failed to unsubscribe ${email}:`, error);
      }
    }

    return successCount;
  }

  /**
   * Get suppression details for an email
   */
  async getSuppressionDetails(workspaceId: string, email: string): Promise<{
    isSuppressed: boolean;
    reason?: string;
    source?: string;
    campaignId?: string;
    createdAt?: Date;
  }> {
    const { data: suppression } = await this.supabase
      .from('suppressions')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('kind', 'email')
      .eq('value_lower', email.toLowerCase())
      .single();

    if (!suppression) {
      return { isSuppressed: false };
    }

    return {
      isSuppressed: true,
      reason: suppression.reason,
      source: suppression.source,
      campaignId: suppression.campaign_id,
      createdAt: new Date(suppression.created_at),
    };
  }
}

// Utility functions
export function createEnhancedUnsubscribeManager(options?: UnsubscribeOptions): EnhancedUnsubscribeManager {
  return new EnhancedUnsubscribeManager(options);
}

export function generateUnsubscribeUrl(token: string, baseUrl?: string): string {
  const manager = new EnhancedUnsubscribeManager();
  return manager.generateUnsubscribeUrl(token, baseUrl);
}

export function generateMailtoUnsubscribe(email: string, subject?: string): string {
  const manager = new EnhancedUnsubscribeManager();
  return manager.generateMailtoUnsubscribe(email, subject);
} 