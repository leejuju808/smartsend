// Provider adapters for inbound email polling
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type Mailbox = {
  id: string;
  user_id: string;
  provider: 'gmail' | 'outlook';
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  provider_email: string | null;
  gmail_history_id?: string | null;
  ms_delta_link?: string | null;
};

export class GmailProvider {
  constructor(
    private mailbox: Mailbox,
    private supabase: ReturnType<typeof createClient>
  ) {}

  async ensureToken(): Promise<void> {
    if (!this.mailbox.token_expires_at || new Date(this.mailbox.token_expires_at).getTime() - Date.now() > 60000) {
      return; // Token still valid
    }

    if (!this.mailbox.refresh_token) {
      throw new Error('Missing refresh_token');
    }

    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
        client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
        grant_type: 'refresh_token',
        refresh_token: this.mailbox.refresh_token,
      }),
    });

    if (!resp.ok) {
      const error = await resp.json();
      throw new Error(`Gmail token refresh failed: ${JSON.stringify(error)}`);
    }

    const data = await resp.json();
    const accessToken = data.access_token as string;
    const expiresIn = data.expires_in as number;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    await this.supabase
      .from('connected_accounts')
      .update({
        access_token: accessToken,
        token_expires_at: expiresAt,
      })
      .eq('id', this.mailbox.id);

    this.mailbox.access_token = accessToken;
    this.mailbox.token_expires_at = expiresAt;
  }
}

export class OutlookProvider {
  constructor(
    private mailbox: Mailbox,
    private supabase: ReturnType<typeof createClient>
  ) {}

  async ensureToken(): Promise<void> {
    if (!this.mailbox.token_expires_at || new Date(this.mailbox.token_expires_at).getTime() - Date.now() > 60000) {
      return; // Token still valid
    }

    if (!this.mailbox.refresh_token) {
      throw new Error('Missing refresh_token');
    }

    const tenant = Deno.env.get('MS_TENANT_ID') || 'common';
    const resp = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: Deno.env.get('MS_CLIENT_ID')!,
        client_secret: Deno.env.get('MS_CLIENT_SECRET')!,
        grant_type: 'refresh_token',
        refresh_token: this.mailbox.refresh_token,
        scope: 'https://graph.microsoft.com/.default offline_access',
      }),
    });

    if (!resp.ok) {
      const error = await resp.json();
      throw new Error(`Outlook token refresh failed: ${JSON.stringify(error)}`);
    }

    const data = await resp.json();
    const accessToken = data.access_token as string;
    const expiresIn = data.expires_in as number;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    await this.supabase
      .from('connected_accounts')
      .update({
        access_token: accessToken,
        token_expires_at: expiresAt,
      })
      .eq('id', this.mailbox.id);

    this.mailbox.access_token = accessToken;
    this.mailbox.token_expires_at = expiresAt;
  }
}

