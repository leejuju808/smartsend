import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";

export async function POST(req: NextRequest) {
  try {
    const { 
      suggestion_id, 
      org_id, 
      lead_id, 
      campaign_id, 
      to, 
      subject, 
      body, 
      label, 
      thread_id, 
      provider,
      reply_to_message_id 
    } = await req.json();

    if (!suggestion_id || !org_id || !lead_id || !to || !subject || !body) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1) Get org owner's email account
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("owner_id")
      .eq("id", org_id)
      .maybeSingle();
    
    if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

    const userId = org.owner_id;

    // Try email_accounts first (OAuth accounts)
    const { data: emailAcct } = await supabaseAdmin
      .from("email_accounts")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    let providerMessageId: string | null = null;
    let providerThreadId: string | null = thread_id || null;

    if (emailAcct) {
      // Use OAuth account (Gmail or Outlook)
      let accessToken = emailAcct.access_token;
      
      // Check if token needs refresh
      const expiresAt = new Date(emailAcct.expires_at);
      const willExpireIn = expiresAt.getTime() - Date.now();
      
      if (willExpireIn < 60_000) { // Less than 1 minute
        if (emailAcct.provider === 'gmail') {
          const res = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: process.env.GOOGLE_CLIENT_ID!,
              client_secret: process.env.GOOGLE_CLIENT_SECRET!,
              refresh_token: emailAcct.refresh_token,
              grant_type: 'refresh_token'
            })
          });
          const tokens = await res.json();
          if (!res.ok) throw new Error('Gmail token refresh failed');
          accessToken = tokens.access_token;
          await supabaseAdmin
            .from("email_accounts")
            .update({
              access_token: tokens.access_token,
              expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
            })
            .eq("id", emailAcct.id);
        } else if (emailAcct.provider === 'outlook') {
          const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: process.env.MICROSOFT_CLIENT_ID!,
              client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
              refresh_token: emailAcct.refresh_token,
              grant_type: 'refresh_token',
              redirect_uri: process.env.MICROSOFT_OAUTH_REDIRECT_URL!
            })
          });
          const tokens = await res.json();
          if (!res.ok) throw new Error('Outlook token refresh failed');
          accessToken = tokens.access_token;
          await supabaseAdmin
            .from("email_accounts")
            .update({
              access_token: tokens.access_token,
              expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
            })
            .eq("id", emailAcct.id);
        }
      }

      // Send via Gmail
      if (emailAcct.provider === 'gmail' || provider === 'gmail') {
        const headers = [
          `To: ${to}`,
          `Subject: ${subject}`,
          "Content-Type: text/html; charset=UTF-8",
          thread_id ? `In-Reply-To: ${reply_to_message_id || thread_id}` : "",
          thread_id ? `References: ${reply_to_message_id || thread_id}` : "",
        ].filter(Boolean);

        const raw = Buffer.from([headers.join("\r\n"), "", body].join("\r\n")).toString("base64");
        
        const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw, threadId: thread_id || undefined })
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error?.message || 'Gmail send failed');
        providerMessageId = j.id;
        providerThreadId = j.threadId || providerThreadId;
      }
      // Send via Outlook
      else if (emailAcct.provider === 'outlook' || provider === 'outlook') {
        let res: Response;
        
        if (reply_to_message_id) {
          // Use reply endpoint to keep threading in Outlook
          const replyPayload = {
            message: {
              body: { contentType: 'HTML', content: body },
            },
            comment: '',
          };
          res = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(reply_to_message_id)}/reply`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(replyPayload),
          });
        } else {
          const payload = {
            message: {
              subject,
              body: { contentType: 'HTML', content: body },
              toRecipients: [{ emailAddress: { address: to } }],
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
        const nodemailer = require('nodemailer');
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
          html: body
        })
        const accepted = Array.isArray((info as any)?.accepted) ? (info as any).accepted.length > 0 : true
        if (!accepted) return NextResponse.json({ error: 'Send rejected' }, { status: 502 })
        providerMessageId = (info as any).messageId;
      } else {
        return NextResponse.json({ error: 'Unsupported provider' }, { status: 400 })
      }
    }

    // 2) Persist & log
    await supabaseAdmin.from("reply_suggestions").update({
      chosen_label: label, 
      chosen_body: body, 
      sent: true, 
      updated_at: new Date().toISOString()
    }).eq("id", suggestion_id);

    // Log in campaign_logs with action='smart_reply_sent'
    await supabaseAdmin.from("campaign_logs").insert({
      org_id, 
      campaign_id, 
      lead_id,
      action: "smart_reply_sent",
      message: `Sent "${label}" via ${provider || 'default'}`,
      event_type: "smart_reply_sent",
      details: { label, provider: provider || 'default' }
    });

    // Optional: set an outcome on the lead if label implies outcome
    const labelMap: Record<string, string> = {
      "Interested": "interested",
      "Pricing": "pricing_sent",
      "Not now": "not_now",
      "Not a fit": "not_fit",
      "Opt-out": "opt_out"
    };
    const outcome = labelMap[label];
    if (outcome) {
      await supabaseAdmin.from("leads").update({ outcome }).eq("id", lead_id);
    }

    return NextResponse.json({ ok: true, provider_message_id: providerMessageId }, { status: 200 });
  } catch (e: any) {
    console.error('Smart reply send error:', e);
    return NextResponse.json({ error: e?.message || 'Send failed' }, { status: 500 });
  }
}

