// Converts various provider payloads to a common shape that our detector expects.
export type NormalizedReply = {
  sender: string;       // email
  subject: string | null;
  bodyText: string;     // plain text best-effort
  messageId: string | null;
};

function coalesceBody(...vals: (string | null | undefined)[]): string {
  for (const v of vals) {
    if (v && typeof v === "string" && v.trim()) return v;
  }
  return "";
}

// --- SendGrid Inbound Parse ---
// Can arrive as multipart/form-data. Fields of interest:
// - from, subject, text, html, headers
export async function normalizeSendGrid(req: Request): Promise<NormalizedReply> {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const from = (form.get("from") as string) || "";
    const subject = (form.get("subject") as string) || null;
    const text = (form.get("text") as string) || "";
    const headers = (form.get("headers") as string) || "";
    // message-id might be in headers; do a light parse
    const midMatch = headers.match(/Message-ID:\s*<([^>]+)>/i);
    const messageId = midMatch ? midMatch[1] : null;
    const sender = from.includes("<")
      ? from.substring(from.indexOf("<") + 1, from.indexOf(">"))
      : from;
    return { sender, subject, bodyText: text, messageId };
  } else {
    const body = await req.json().catch(() => ({}));
    const from = (body.from as string) || "";
    const subject = (body.subject as string) || null;
    const text = (body.text as string) || "";
    const messageId = (body["Message-Id"] as string) || (body.message_id as string) || null;
    const sender = from.includes("<")
      ? from.substring(from.indexOf("<") + 1, from.indexOf(">"))
      : from;
    return { sender, subject, bodyText: text, messageId };
  }
}

// --- Postmark Inbound ---
// JSON: { FromFull: { Email }, Subject, TextBody, HtmlBody, MessageID }
export async function normalizePostmark(req: Request): Promise<NormalizedReply> {
  const body = await req.json();
  const sender = body?.FromFull?.Email || body?.From || "";
  const subject = body?.Subject ?? null;
  const text = coalesceBody(body?.StrippedTextReply, body?.TextBody);
  const messageId = body?.MessageID ?? body?.MessageId ?? null;
  return { sender, subject, bodyText: text, messageId };
}

// --- Mailgun Routes Webhook ---
// form-data or JSON; typical fields: sender, subject, "body-plain", "stripped-text", "Message-Id"
export async function normalizeMailgun(req: Request): Promise<NormalizedReply> {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const sender = (form.get("sender") as string) || "";
    const subject = ((form.get("subject") as string) || null) as string | null;
    const text = coalesceBody(
      form.get("stripped-text") as string,
      form.get("body-plain") as string
    );
    const messageId = (form.get("Message-Id") as string) || null;
    return { sender, subject, bodyText: text, messageId };
  } else {
    const body = await req.json().catch(() => ({}));
    const sender = (body.sender as string) || "";
    const subject = (body.subject as string) || null;
    const text = coalesceBody(body["stripped-text"], body["body-plain"], body["TextBody"]);
    const messageId = (body["Message-Id"] as string) || body?.MessageId || null;
    return { sender, subject, bodyText: text, messageId };
  }
}
