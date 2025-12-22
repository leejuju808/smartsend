import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import { buildMultipartAlternative, Attachment } from "@/lib/mime";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const runtime = 'nodejs'

// Token refresh helpers
async function refreshGmailToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });
  if (!res.ok) throw new Error('Gmail token refresh failed');
  return res.json();
}

async function refreshOutlookToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      redirect_uri: process.env.MICROSOFT_OAUTH_REDIRECT_URL!
    })
  });
  if (!res.ok) throw new Error('Outlook token refresh failed');
  return res.json();
}

// (moved) MIME builder lives in @/lib/mime

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { threadId, to, subject, bodyText, bodyHtml, threadId_provider, replyToMessageId, inReplyTo, references, attachmentIds, provider } = body as { 
      threadId: string; 
      to: string; 
      subject: string; 
      bodyText: string;
      bodyHtml?: string;
      threadId_provider?: string;
      replyToMessageId?: string;
      inReplyTo?: string;
      references?: string;
      attachmentIds?: string[];
      provider?: "gmail" | "outlook" | "auto";
    };
    
    if (!threadId || !to || !subject || (!bodyText && !bodyHtml)) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const html = bodyHtml || bodyText.replace(/\n/g, '<br>');

    // Fetch attachments if provided
    let attachments: Attachment[] = [];
    if (attachmentIds && attachmentIds.length > 0) {
      const { data: attachmentRecords, error: attachmentError } = await supabaseAdmin
        .from('email_attachments')
        .select('id, filename, content_type, storage_path, is_inline, content_id')
        .in('id', attachmentIds);

      if (attachmentRecords && !attachmentError) {
        // Download files from storage
        const attachmentPromises = attachmentRecords.map(async (att) => {
          const { data: fileData, error: downloadError } = await supabase.storage
            .from('email-attachments')
            .download(att.storage_path);

          if (downloadError || !fileData) {
            console.error('Failed to download attachment:', downloadError);
            return null;
          }

          const arrayBuffer = await fileData.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);

          return {
            filename: att.filename,
            content: buffer,
            contentType: att.content_type,
            contentId: att.content_id || undefined,
            isInline: att.is_inline,
          };
        });

        const results = await Promise.all(attachmentPromises);
        attachments = results.filter((att): att is Attachment => att !== null);
      }
    }

    // Get thread and workspace
    const { data: t } = await supabaseAdmin
      .from('inbox_threads')
      .select('id, workspace_id, contact_id, campaign_id')
      .eq('id', threadId)
      .maybeSingle()
    if (!t) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })

    // Get workspace owner
    const { data: workspace } = await supabaseAdmin
      .from('workspaces')
      .select('owner_id')
      .eq('id', (t as any).workspace_id)
      .maybeSingle()
    const userId = (workspace as any)?.owner_id
    if (!userId) return NextResponse.json({ error: 'No workspace owner' }, { status: 400 })

    // Check for connected Gmail mailbox (preferred for queued sending)
    const { data: mailbox } = await supabaseAdmin
      .from('mailboxes')
      .select('id, email, provider, oauth')
      .eq('user_id', userId)
      .eq('provider', 'gmail')
      .not('oauth', 'is', null)
      .limit(1)
      .maybeSingle()

    // If we have a mailbox with OAuth, queue the message instead of sending directly
    if (mailbox && mailbox.oauth) {
      const { error: queueError } = await supabaseAdmin.from('send_queue').insert({
        mailbox_id: mailbox.id,
        thread_id: threadId,
        subject: subject,
        body: bodyText || bodyHtml || '',
        scheduled_at: new Date().toISOString(),
        status: 'queued',
        meta: { to }
      });

      if (queueError) {
        console.error('Queue error:', queueError);
        return NextResponse.json({ error: 'Failed to queue message' }, { status: 500 });
      }

      return NextResponse.json({ ok: true, queued: true });
    }

    // Fallback to direct send via email_accounts or outlook_accounts
    // If provider is specified, use that; otherwise auto-detect
    let emailAcct: any = null;
    
    if (provider === "outlook") {
      // Get Outlook account via org
      // First get org_id from org_members
      const { data: orgMember } = await supabaseAdmin
        .from('org_members')
        .select('org_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      
      if (orgMember?.org_id) {
        const { data: outlookAcct } = await supabaseAdmin
          .from('outlook_accounts')
          .select('*')
          .eq('org_id', orgMember.org_id)
          .maybeSingle();
        if (outlookAcct) {
          emailAcct = { ...outlookAcct, provider: 'outlook' };
        }
      }
    } else if (provider === "gmail") {
      const { data: gmailAcct } = await supabaseAdmin
        .from('email_accounts')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', 'gmail')
        .eq('is_active', true)
        .maybeSingle();
      emailAcct = gmailAcct;
    } else {
      // Auto: try Gmail first, then Outlook
      const { data: gmailAcct } = await supabaseAdmin
        .from('email_accounts')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle();
      emailAcct = gmailAcct;
      
      if (!emailAcct) {
        // Try Outlook via org
        const { data: orgMember } = await supabaseAdmin
          .from('org_members')
          .select('org_id')
          .eq('user_id', userId)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        
        if (orgMember?.org_id) {
          const { data: outlookAcct } = await supabaseAdmin
            .from('outlook_accounts')
            .select('*')
            .eq('org_id', orgMember.org_id)
            .maybeSingle();
          if (outlookAcct) {
            emailAcct = { ...outlookAcct, provider: 'outlook' };
          }
        }
      }
    }

    let providerMessageId: string | null = null;
    let providerThreadId: string | null = threadId_provider || null;

    if (emailAcct) {
      // Use OAuth account (Gmail or Outlook)
      let accessToken = emailAcct.access_token;
      
      // Check if token needs refresh
      const expiresAt = new Date(emailAcct.token_expiry || emailAcct.expires_at);
      const willExpireIn = expiresAt.getTime() - Date.now();
      
      if (willExpireIn < 60_000) { // Less than 1 minute
        if (emailAcct.provider === 'gmail') {
          const tokens = await refreshGmailToken(emailAcct.refresh_token);
          accessToken = tokens.access_token;
          await supabaseAdmin
            .from('email_accounts')
            .update({
              access_token: tokens.access_token,
              expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', emailAcct.id);
        } else if (emailAcct.provider === 'outlook') {
          const tokens = await refreshOutlookToken(emailAcct.refresh_token);
          accessToken = tokens.access_token;
          await supabaseAdmin
            .from('outlook_accounts')
            .update({
              access_token: tokens.access_token,
              token_expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', emailAcct.id);
        }
      }

      // Send via Gmail
      if (emailAcct.provider === 'gmail') {
        const raw = buildMultipartAlternative({
          from: emailAcct.email,
          to,
          subject,
          text: bodyText || '',
          html,
          headers: {
            'In-Reply-To': inReplyTo || undefined,
            'References': references || undefined,
          },
          attachments: attachments.length > 0 ? attachments : undefined,
        });
        const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw, threadId: threadId_provider || undefined })
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error?.message || 'Gmail send failed');
        providerMessageId = j.id;
        providerThreadId = j.threadId || providerThreadId;
      }
      // Send via Outlook
      else if (emailAcct.provider === 'outlook') {
        let res: Response;
        
        // Prepare base64 attachments for Outlook Graph API
        const outlookAttachments = attachments.length > 0 ? attachments.map(att => {
          const attachmentPayload: any = {
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: att.filename,
            contentType: att.contentType,
            contentBytes: Buffer.from(att.content).toString('base64'),
          };
          if (att.contentId) {
            attachmentPayload.contentId = att.contentId;
          }
          if (att.isInline !== undefined) {
            attachmentPayload.isInline = att.isInline;
          }
          return attachmentPayload;
        }) : undefined;

        if (replyToMessageId) {
          // Use reply endpoint to keep threading in Outlook
          const replyPayload = {
            message: {
              body: { contentType: 'HTML', content: html },
              attachments: outlookAttachments,
            },
            comment: '',
          };
          res = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(replyToMessageId)}/reply`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(replyPayload),
          });
        } else {
          const payload = {
            message: {
              subject,
              body: { contentType: 'HTML', content: html },
              toRecipients: [{ emailAddress: { address: to } }],
              attachments: outlookAttachments,
            },
            saveToSentItems: true
          };
          res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        }
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Outlook send failed: ${text}`);
        }
        // Outlook returns 202 Accepted with no body, so we generate a placeholder ID
        providerMessageId = `outlook-${Date.now()}`;
      }
    } else {
      // Fallback to SMTP mailboxes
      const { data: mb } = await supabaseAdmin
        .from('mailboxes')
        .select('provider, smtp_host, smtp_port, smtp_username, smtp_password, from_email, from_name')
        .eq('owner', userId)
        .maybeSingle()
      if (!mb) return NextResponse.json({ error: 'No email account configured' }, { status: 400 })

      if (mb.provider === 'smtp') {
        const transporter = nodemailer.createTransport({
          host: (mb as any).smtp_host,
          port: Number((mb as any).smtp_port) || 587,
          secure: false,
          auth: (mb as any).smtp_username && (mb as any).smtp_password ? { user: (mb as any).smtp_username, pass: (mb as any).smtp_password } : undefined,
        })
        const info = await transporter.sendMail({
          from: `${(mb as any).from_name || 'SmartSend'} <${(mb as any).from_email || (mb as any).smtp_username}>`,
          to,
          subject,
          text: bodyText,
          html: bodyHtml
        })
        const accepted = Array.isArray((info as any)?.accepted) ? (info as any).accepted.length > 0 : true
        if (!accepted) return NextResponse.json({ error: 'Send rejected' }, { status: 502 })
        providerMessageId = (info as any).messageId;
      } else {
        return NextResponse.json({ error: 'Unsupported provider' }, { status: 400 })
      }
    }

    // Insert outbound message into inbox_messages
    const { data: message } = await supabaseAdmin
      .from('inbox_messages')
      .insert({ 
        thread_id: threadId, 
        sender: emailAcct?.email || mailbox?.email || 'unknown', 
        body: bodyHtml || bodyText, 
        is_incoming: false, 
        sent_at: new Date().toISOString() 
      })
      .select('id')
      .single()

    // Update thread
    await supabaseAdmin
      .from('inbox_threads')
      .update({ last_message_at: new Date().toISOString(), status: 'open' })
      .eq('id', threadId)

    // Log in email_messages with direction='out'
    let emailMessageId: string | null = null;
    if (message && (t as any).campaign_id) {
      const { data: emailMsg } = await supabaseAdmin
        .from('email_messages')
        .insert({
          workspace_id: (t as any).workspace_id,
          campaign_id: (t as any).campaign_id,
          lead_id: (t as any).contact_id,
          subject,
          body_html: html,
          provider_message_id: providerMessageId,
          sent_at: new Date().toISOString(),
          direction: 'out'
        })
        .select('id')
        .single();
      emailMessageId = emailMsg?.id || null;
    }

    // Link attachments to the email message after successful send
    if (emailMessageId && attachmentIds && attachmentIds.length > 0) {
      await supabaseAdmin
        .from('email_attachments')
        .update({ message_id: emailMessageId })
        .in('id', attachmentIds);
    }

    return NextResponse.json({ ok: true, messageId: providerMessageId, threadId: providerThreadId })
  } catch (e: any) {
    console.error('Send error:', e);
    return NextResponse.json({ error: e?.message || 'Error' }, { status: 500 })
  }
}

