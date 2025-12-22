import { createClient } from "@supabase/supabase-js";
import { refreshAccessToken } from "@/lib/googleOauth";
import { wrapHtml } from "@/lib/tracking";
import { buildMultipartAlternative, type Attachment } from "@/lib/mime";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export async function sendWithSender(opts: {
  senderAccountId: string;
  to: string;
  subject: string;
  textOrHtml: string; // treat as HTML template here
  campaignId?: string; // optional, for future template vars
  leadId?: string;     // optional, for future template vars
  attachments?: Attachment[];
}): Promise<{
  messageId: string | null;
  threadId: string | null;
  headers: Record<string, string>;
  provider: "gmail" | "outlook" | "other";
  threadUrl: string | null;
}> {
  const { data: sa, error } = await supabase
    .from("sender_accounts")
    .select("*")
    .eq("id", opts.senderAccountId)
    .single();
  if (error || !sa) throw new Error(error?.message || "sender not found");

  // Resolve lead to get tracking token (prefer by email if no leadId supplied)
  let lead: any = null;
  if (opts.leadId) {
    lead = (await supabase.from("leads").select("id,tracking_token,email,unsubscribed").eq("id", opts.leadId).single()).data;
  } else {
    lead = (await supabase.from("leads").select("id,tracking_token,email,unsubscribed").eq("email", opts.to).limit(1).maybeSingle()).data;
  }
  if (!lead) throw new Error("lead not found");
  if (lead.unsubscribed) throw new Error("lead unsubscribed");

  // Ensure tracking token exists
  let token = lead.tracking_token;
  if (!token) {
    const { data: updated, error: upErr } = await supabase
      .from("leads")
      .update({ tracking_token: "gen_random_uuid()" as unknown as string })
      .eq("id", lead.id)
      .select("tracking_token")
      .single();
    if (upErr) throw new Error(upErr.message);
    token = updated!.tracking_token;
  }

  // Build HTML with tracking pixel + unsub + rewritten links
  const html = wrapHtml({ html: opts.textOrHtml, token });
  const text = stripHtml(html);

  if (sa.provider === "gmail") {
    // ensure fresh token
    const exp = new Date(sa.expires_at).getTime();
    let accessToken = sa.access_token as string;
    if (Date.now() > exp - 30_000) {
      const tokens = await refreshAccessToken(sa.refresh_token);
      const expiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString();
      const { data: upd, error: upErr } = await supabase
        .from("sender_accounts")
        .update({ access_token: tokens.access_token, expires_at: expiresAt })
        .eq("id", sa.id)
        .select("*")
        .single();
      if (upErr) throw new Error(upErr.message);
      accessToken = upd!.access_token;
    }

    // Generate Message-ID header for deep linking
    const messageIdHeader = `<${Date.now()}.${Math.random().toString(36).substring(2)}@${sa.email.split("@")[1] || "smartsend.ai"}>`;

    const fromHeader = typeof sa.name === "string" && sa.name
      ? `${sa.name} <${sa.email}>`
      : sa.email;

    const raw = buildMultipartAlternative({
      from: fromHeader,
      to: opts.to,
      subject: opts.subject,
      text,
      html,
      headers: {
        "Message-ID": messageIdHeader,
      },
      attachments: opts.attachments && opts.attachments.length > 0 ? opts.attachments : undefined,
    });

    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`gmail send failed: ${response.status} ${errText}`);
    }
    const result = await response.json();
    
    return {
      messageId: result?.id || null,
      threadId: result?.threadId || null,
      headers: {
        "Message-Id": messageIdHeader,
      },
      provider: "gmail" as const,
      threadUrl: null, // Gmail doesn't return thread URLs directly
    };
  }

  throw new Error(`provider ${sa.provider} not implemented`);
}


