import { google } from 'googleapis';
import { supabaseAdmin } from '@/server/supabase';
import { refreshAccessToken } from '@/lib/providers/google/oauth';
import { detectHuman } from './isHuman';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

interface GmailMessage {
  id: string;
  threadId?: string;
  snippet?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    body?: { data?: string };
    parts?: Array<{ mimeType?: string; body?: { data?: string }; parts?: Array<any> }>;
  };
  internalDate?: string;
}

function getHeader(headers: Array<{ name: string; value: string }> | undefined, name: string): string | null {
  if (!headers) return null;
  const h = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? null;
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const padding = base64.length % 4;
  const padded = base64 + '='.repeat(padding ? 4 - padding : 0);
  return Buffer.from(padded, 'base64').toString('utf-8');
}

function extractBodyText(message: GmailMessage): string {
  const payload = message.payload;
  if (!payload) return message.snippet || '';

  let plainText: string | null = null;
  let htmlText: string | null = null;

  // Try to get plain text body
  function findTextPart(parts: any[]): void {
    for (const part of parts) {
      if (part.mimeType === 'text/plain' && part.body?.data && !plainText) {
        plainText = decodeBase64Url(part.body.data);
      }
      if (part.mimeType === 'text/html' && part.body?.data && !htmlText) {
        htmlText = decodeBase64Url(part.body.data);
      }
      if (part.parts) {
        findTextPart(part.parts);
      }
    }
  }

  if (payload.parts) {
    findTextPart(payload.parts);
  }

  if (plainText) return plainText;
  if (htmlText) {
    // Strip HTML tags (basic)
    return htmlText.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim();
  }

  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  return message.snippet || '';
}

export async function pullGmailSinceISO(
  sinceISO: string,
  userId: string
): Promise<{ inserted: number; error?: string }> {
  try {
    // Get Gmail connected accounts for the specified user
    const { data: accounts, error: accountsError } = await supabaseAdmin
      .from('connected_accounts')
      .select('*')
      .eq('provider', 'gmail')
      .eq('user_id', userId)
      .not('refresh_token', 'is', null);

    if (accountsError || !accounts?.length) {
      return { inserted: 0, error: 'No Gmail accounts connected' };
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
          const tokens = await refreshAccessToken({
            refreshToken: account.refresh_token,
            clientId: GOOGLE_CLIENT_ID,
            clientSecret: GOOGLE_CLIENT_SECRET,
          });

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

        // Create Gmail client
        const oauth2 = new google.auth.OAuth2(
          GOOGLE_CLIENT_ID,
          GOOGLE_CLIENT_SECRET,
          process.env.GOOGLE_OAUTH_REDIRECT_URL || process.env.GOOGLE_REDIRECT_URI
        );

        oauth2.setCredentials({
          access_token: accessToken,
          refresh_token: account.refresh_token,
        });

        const gmail = google.gmail({ version: 'v1', auth: oauth2 });

        // Query for messages since the given date
        const sinceTimestamp = Math.floor(new Date(sinceISO).getTime() / 1000);
        const query = `in:inbox -from:me after:${sinceTimestamp}`;

        // List messages
        const listRes = await gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: 500,
        });

        const messageIds = listRes.data.messages?.map(m => m.id!) || [];
        if (messageIds.length === 0) {
          continue;
        }

        // Fetch full messages in batches
        for (let i = 0; i < messageIds.length; i += 10) {
          const batch = messageIds.slice(i, i + 10);
          const messages = await Promise.all(
            batch.map(id =>
              gmail.users.messages.get({
                userId: 'me',
                id,
                format: 'full',
              })
            )
          );

          for (const msg of messages) {
            const m = msg.data as GmailMessage;
            const headers = m.payload?.headers || [];
            const from = getHeader(headers, 'From');
            const to = getHeader(headers, 'To');
            const subject = getHeader(headers, 'Subject');
            const internetMessageId = getHeader(headers, 'Message-ID');

            if (!from || !to) continue;

            // Extract email from "Name <email@domain.com>" format
            const fromMatch = from.match(/<([^>]+)>/) || [null, from];
            const fromEmail = fromMatch[1] || from;

            const bodyText = extractBodyText(m);
            const date = m.internalDate ? new Date(parseInt(m.internalDate)) : new Date();

            // Check if already exists (dedupe by message_id)
            if (internetMessageId) {
              const { data: existing } = await supabaseAdmin
                .from('replies')
                .select('id')
                .eq('message_id', internetMessageId)
                .maybeSingle();

              if (existing) continue;
            }

            // Detect if human
            const isHuman = await detectHuman(subject || '', bodyText);

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
              subject: subject ?? '',
              snippet: bodyText.slice(0, 280),
              body_text: bodyText,
              body_html: null,
              from_email: fromEmail,
              to_email: to,
              message_id: internetMessageId ?? m.id,
              thread_id: m.threadId ?? null,
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
        }
      } catch (accountError: any) {
        console.error(`Error processing Gmail account ${account.id}:`, accountError);
        // Continue with next account
      }
    }

    return { inserted: totalInserted };
  } catch (e: any) {
    return { inserted: 0, error: e?.message ?? 'Gmail pull failed' };
  }
}

