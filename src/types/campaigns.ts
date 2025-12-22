export type CreateCampaignRequest = {
  name: string;
  from_name?: string;
  from_email: string;
  start_date?: string; // yyyy-mm-dd
  window_start_hour: number; // 0..23
  window_end_hour: number;   // 1..24 (must be > start)
  per_minute_rate: number;   // 1..60
  daily_cap: number;         // 1..2000
  track_replies?: boolean;
};

export type CreateCampaignResponse = {
  id: string;
  enqueued: number;
  error?: string;
};

