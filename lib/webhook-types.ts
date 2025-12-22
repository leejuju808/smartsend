// Shared types for webhook event normalization

export type NormalizedEvent = {
  provider: 'gmail' | 'outlook' | 'generic';
  event_type: 'delivered' | 'bounce' | 'complaint' | 'deferred' | 'opened' | 'clicked' | 'other';
  message_id?: string | null;
  queue_id?: string | null;
  account_id?: string | null;
  campaign_id?: string | null;
  recipient?: string | null;
  code?: string | null;
  reason?: string | null;
  payload?: any;
};














