export interface Meeting {
  id: string;
  user_id: string;
  contact_email: string;
  thread_id?: string | null;
  subject?: string | null;
  start_at: string;
  end_at: string;
  status: 'proposed' | 'booked' | 'declined' | 'canceled';
  calendly_link?: string | null;
  ics?: string | null;
  location?: string | null;
  created_at: string;
  
  // Calendly webhook fields
  external_source?: string | null;
  external_event_id?: string | null;
  invitee_uri?: string | null;
  event_uri?: string | null;
  booked_at?: string | null;
}

export interface MeetingCreateRequest {
  user_id: string;
  contact_email: string;
  thread_id?: string;
  subject?: string;
  start_at: string;
  end_at: string;
  status?: 'proposed' | 'booked' | 'declined' | 'canceled';
  calendly_link?: string;
  ics?: string;
  location?: string;
  external_source?: string;
  external_event_id?: string;
}

export interface MeetingUpdateRequest {
  status?: 'proposed' | 'booked' | 'declined' | 'canceled';
  calendly_link?: string | null;
  ics?: string | null;
  location?: string | null;
  external_source?: string | null;
  external_event_id?: string | null;
  invitee_uri?: string | null;
  event_uri?: string | null;
  booked_at?: string | null;
  start_at?: string;
  end_at?: string;
}

export interface CalendlyWebhookPayload {
  event: 'invitee.created' | 'invitee.updated' | 'invitee.canceled';
  payload: {
    invitee: {
      uri: string;
      start_time: string;
      end_time: string;
      email: string;
      name: string;
    };
    event: {
      uri: string;
      uuid: string;
      location?: {
        location: string;
      };
    };
  };
} 