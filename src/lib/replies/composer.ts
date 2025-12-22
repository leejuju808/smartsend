import { createClientComponentClient } from '@/lib/supabase';

const supabase = createClientComponentClient();

export interface EmailConnection {
  id: string;
  org_id: string;
  provider: 'gmail' | 'outlook';
  account_email: string;
  account_name: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expiry: string | null;
  created_at: string;
  updated_at: string;
}

export async function listConnections(): Promise<EmailConnection[]> {
  const { data, error } = await supabase.from('email_connections').select('*');
  if (error) throw error;
  return (data || []) as EmailConnection[];
}

export async function sendReply(payload: {
  org_id: string;
  thread_id: string;
  connection_id: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  quote_html?: string;
}) {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    throw new Error('Not authenticated');
  }

  const res = await fetch('/api/threads/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(error || 'Failed to send reply');
  }

  return await res.json();
}

