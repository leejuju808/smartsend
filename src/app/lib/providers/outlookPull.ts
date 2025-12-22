import { supabaseAdmin } from '@/server/supabase';
import { detectHuman } from './isHuman';

const MS_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID!;
const MS_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET!;
const MS_REDIRECT_URI = process.env.MICROSOFT_OAUTH_REDIRECT_URL!;
const MS_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

async function refreshMicrosoftToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const params = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    client_secret: MS_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    redirect_uri: MS_REDIRECT_URI,
  });

  const res = await fetch(MS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Microsoft token refresh failed: ${text}`);
  }

  return await res.json();
}

async function graphFetch<T>(
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const url = path.startsWith('https://') ? path : `${GRAPH_BASE}/${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph API ${path} failed: ${text}`);
  }

  return res.json();
}

interface OutlookMessage {
  id: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  body?: {
    contentType: 'text' | 'html';
    content: string;
  };
  from?: {
    emailAddress: {
      address: string;
      name?: string;
    };
  };
  toRecipients?: Array<{
    emailAddress: {
      address: string;
      name?: string;
    };
  }>;
  internetMessageId?: string;
  receivedDateTime: string;
}

function extractBodyText(message: OutlookMessage): string {
  if (message.body?.contentType === 'text') {
    return message.body.content;
  }
  if (message.body?.contentType === 'html') {
    // Basic HTML stripping
    return message.body.content
      .replace(/<[^>]*>/g, '')
      .replace(/&[^;]+;/g, ' ')
      .trim();
  }
  return message.bodyPreview || '';
}

export async function pullOutlookSinceISO(
  sinceISO: string,
  userId: string
): Promise<{ inserted: number; error?: string }> {
  try {
    // Get Outlook connected accounts for the specified user
    const { data: accounts, error: accountsError } = await supabaseAdmin
      .from('connected_accounts')
      .select('*')
      .eq('provider', 'outlook')
      .eq('user_id', userId)
      .not('refresh_token', 'is', null);

    if (accountsError || !accounts?.length) {
      return { inserted: 0, error: 'No Outlook accounts connected' };
    }

    let totalInserted = 0;

    for (const account of accounts) {
      try {
        // Refresh token if needed
        let accessToken = account.access_token;
        const expiresAt = account.expires_at ? new Date(account.expires_at).getTime() : 0;
        const now = Date.now();

        if (!accessToken || now >= expiresAt - 300000) {
          // Refresh 5min before expiry
          const tokens = await refreshMicrosoftToken(account.refresh_token);
          accessToken = tokens.access_token;

          // Update in DB
          await supabaseAdmin
            .from('connected_accounts')
            .update({
              access_token: tokens.access_token,
              expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
            })
            .eq('id', account.id);
        }

        // Get user email (needed for Graph API path)
        let userEmail = account.user_id; // Fallback to user_id if email not stored
        try {
          const profile = await graphFetch<{ mail?: string; userPrincipalName?: string }>(
            accessToken,
            'me'
          );
          userEmail = profile.mail || profile.userPrincipalName || userEmail;
        } catch {
          // If we can't get profile, continue with user_id
        }

        // Query messages from Inbox since the given date
        const sinceDate = new Date(sinceISO).toISOString();
        const filter = `receivedDateTime ge ${sinceDate}`;
        
        let url = `me/mailFolders/inbox/messages?$filter=${encodeURIComponent(filter)}&$orderby=receivedDateTime desc&$top=500&$select=id,conversationId,subject,bodyPreview,body,from,toRecipients,internetMessageId,receivedDateTime`;
        let hasMore = true;

        while (hasMore) {
          const response = await graphFetch<{
            value: OutlookMessage[];
            '@odata.nextLink'?: string;
          }>(accessToken, url);

          const messages = response.value || [];
          if (messages.length === 0) {
            hasMore = false;
            continue;
          }

          for (const m of messages) {
            // Skip outbound messages (from us)
            const fromEmail = m.from?.emailAddress?.address;
            if (!fromEmail) continue;

            // Get to email (should be our account)
            const toEmail = m.toRecipients?.[0]?.emailAddress?.address || userEmail;

            const subject = m.subject || '';
            const bodyText = extractBodyText(m);
            const date = new Date(m.receivedDateTime);

            // Check if already exists (dedupe by message_id)
            if (m.internetMessageId || m.id) {
              const messageId = m.internetMessageId || m.id;
              const { data: existing } = await supabaseAdmin
                .from('replies')
                .select('id')
                .eq('message_id', messageId)
                .maybeSingle();

              if (existing) continue;
            }

            // Detect if human
            const isHuman = await detectHuman(subject, bodyText);

            // Find lead by email
            const { data: lead } = await supabaseAdmin
              .from('leads')
              .select('id')
              .eq('email', fromEmail)
              .maybeSingle();

            const insert = {
              id: crypto.randomUUID(),
              lead_id: lead?.id ?? null,
              campaign_id: null,
              subject: subject,
              snippet: bodyText.slice(0, 280),
              body_text: bodyText,
              body_html: m.body?.contentType === 'html' ? m.body.content : null,
              from_email: fromEmail,
              to_email: toEmail,
              message_id: m.internetMessageId || m.id,
              thread_id: m.conversationId ?? null,
              created_at: date.toISOString(),
              status: 'open' as const,
              handled_by: null,
              handled_at: null,
              internal_note: null,
              is_human: isHuman,
            };

            const { error } = await supabaseAdmin.from('replies').insert(insert);
            if (!error) {
              totalInserted++;
              if (isHuman && lead?.id) {
                await supabaseAdmin.rpc('mark_lead_replied', {
                  p_lead_id: lead.id,
                  p_reply_id: insert.id,
                });
              }
            }
          }

          // Check for next page
          if (response['@odata.nextLink']) {
            url = response['@odata.nextLink'];
          } else {
            hasMore = false;
          }
        }
      } catch (accountError: any) {
        console.error(`Error processing Outlook account ${account.id}:`, accountError);
        // Continue with next account
      }
    }

    return { inserted: totalInserted };
  } catch (e: any) {
    return { inserted: 0, error: e?.message ?? 'Outlook pull failed' };
  }
}

