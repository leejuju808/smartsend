import sgMail from "@sendgrid/mail";

if (!process.env.SENDGRID_API_KEY) {
  console.warn("WARN: SENDGRID_API_KEY not set — emails will be skipped.");
} else {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// Tiny markdown-to-HTML (no deps) + very basic sanitize (allow a small set)
export function mdToHtml(md: string): string {
  // paragraphs
  const html = md
    .split(/\n{2,}/g)
    .map(p => p.trim().replace(/\n/g, "<br>"))
    .map(p => p ? `<p>${p}</p>` : "")
    .join("");
  return basicSanitize(html);
}

function basicSanitize(html: string): string {
  // strip script/style and on* attrs
  let h = html.replace(/<\s*(script|style)[^>]*>.*?<\s*\/\s*\1\s*>/gis, "");
  h = h.replace(/\son\w+="[^"]*"/gi, "");
  h = h.replace(/\son\w+='[^']*'/gi, "");
  h = h.replace(/javascript:/gi, "");
  return h;
}

type SendArgs = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string,string>;
};

// Legacy function for backward compatibility
export async function sendEmailWithHtml({ to, subject, html, text, headers }: SendArgs) {
  if (!process.env.SENDGRID_API_KEY) return { ok: false, skipped: true, reason: "no_api_key" };

  const msg = {
    to,
    from: process.env.SMARTSEND_FROM || "noreply@example.com",
    replyTo: process.env.SMARTSEND_REPLY_TO || undefined,
    subject,
    html,
    text: text ?? html.replace(/<[^>]+>/g, ""),
    headers,
  } as any;

  try {
    await sgMail.send(msg);
    return { ok: true };
  } catch (e: any) {
    console.error("sendEmailWithHtml error", e?.response?.body || e?.message || e);
    return { ok: false, error: e?.message || "sendgrid_error" };
  }
}

// Block 8580: Simple email sending interface for sending settings
// Wire this to Resend, AWS SES, SendGrid, etc.
// Uses the existing SendGrid implementation
export type SendEmailOptions = {
  to: string;
  from: string;
  subject: string;
  text: string;
};

// Export sendEmail with the Block 8580 signature
// This function can be called from the test send endpoint
export async function sendEmail(options: SendEmailOptions) {
  // Use existing SendGrid implementation
  if (!process.env.SENDGRID_API_KEY) {
    console.warn("SENDGRID_API_KEY not set — email will be skipped.");
    return { success: false, error: "No email provider configured" };
  }

  try {
    const msg = {
      to: options.to,
      from: options.from,
      subject: options.subject,
      text: options.text,
      html: options.text.replace(/\n/g, "<br>"), // Convert text to basic HTML
    };

    await sgMail.send(msg);
    return { success: true };
  } catch (e: any) {
    console.error("sendEmail error", e?.response?.body || e?.message || e);
    return { success: false, error: e?.message || "sendgrid_error" };
  }
}