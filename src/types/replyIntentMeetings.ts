export interface ReplyIntentMeeting {
  id: string;
  profile_id: string;
  contact_id?: string | null;
  campaign_id?: string | null;
  message_id?: string | null;
  status: 'proposed' | 'booked' | 'cancelled';
  calendly_event_uri?: string | null;
  calendly_invitee_uri?: string | null;
  scheduled_at?: string | null;
  title: string;
  location: string;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReplyIntentMetrics {
  profile_id: string;
  replies: number;
  booked: number;
  intents: number;
  mb_per_100: number;
} 