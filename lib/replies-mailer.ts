import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildMultipartAlternative } from "src/lib/mime";

type SendArgs = {
  to: string;
  subject: string;
  html: string;
  threadId?: string | null; // provider thread id if available
  inReplyTo?: string | null; // message-id for threading
  references?: string | null;
  userId: string;
};

export async function sendMail(args: SendArgs): Promise<{ 
  provider: 'gmail' | 'outlook', 
  providerMessageId: string, 
  providerThreadId?: string | null 
}> {
  // Fetch user's provider + tokens from Supabase
  const { data: emailAcct, error } = await supabaseAdmin
    .from("email_accounts")
    .select("*")
    .eq("user_id", args.userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !emailAcct) {
    throw new Error("No connected email account found");
  }

  const provider = emailAcct.provider as 'gmail' | 'outlook';
  let accessToken = emailAcct.access_token;

  // Check if token needs refresh
  const expiresAt = new Date(emailAcct.expires_at);
  const willExpireIn = expiresAt.getTime() - Date.now();

  if (willExpireIn < 60_000) { // Less than 1 minute
    if (provider === 'gmail') {
      const tokens = await refreshGmailToken(emailAcct.refresh_token);
      accessToken = tokens.access_token;
      await supabaseAdmin
        .from("email_accounts")
        .update({
          access_token: tokens.access_token,
          expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("id", emailAcct.id);
    } else if (provider === 'outlook') {
      const tokens = await refreshOutlookToken(emailAcct.refresh_token);
      accessToken = tokens.access_token;
      await supabaseAdmin
        .from("email_accounts")
        .update({
          access_token: tokens.access_token,
          expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("id", emailAcct.id);
    }
  }

  // Convert HTML to text
  const bodyText = args.html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

  // Send via appropriate provider
  if (provider === 'gmail') {
    return await sendGmail(args, accessToken, emailAcct.email);
  } else if (provider === 'outlook') {
    return await sendOutlook(args, accessToken);
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }
}

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

async function sendGmail(
  args: SendArgs, 
  accessToken: string, 
  fromEmail: string
): Promise<{ provider: 'gmail', providerMessageId: string, providerThreadId?: string | null }> {
  const raw = buildMultipartAlternative({
    from: fromEmail,
    to: args.to,
    subject: args.subject,
    text: args.html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim(),
    html: args.html,
    headers: {
      'In-Reply-To': args.inReplyTo || undefined,
      'References': args.references || undefined,
    }
  });

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw, threadId: args.threadId || undefined })
  });

  const j = await res.json();
  if (!res.ok) throw new Error(j.error?.message || 'Gmail send failed');
  
  return { 
    provider: 'gmail', 
    providerMessageId: j.id,
    providerThreadId: j.threadId || args.threadId
  };
}

async function sendOutlook(
  args: SendArgs, 
  accessToken: string
): Promise<{ provider: 'outlook', providerMessageId: string, providerThreadId?: string | null }> {
  const body = {
    message: {
      subject: args.subject,
      body: { contentType: 'HTML', content: args.html },
      toRecipients: [{ emailAddress: { address: args.to } }],
    },
    saveToSentItems: true,
  };

  const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Outlook send failed: ${text}`);
  }

  // Outlook returns 202 Accepted with no body, generate placeholder ID
  const providerMessageId = `outlook-${Date.now()}`;
  return { 
    provider: 'outlook', 
    providerMessageId,
    providerThreadId: args.threadId
  };
}

