import { NextRequest, NextResponse } from "next/server";

/**
 * SmartSend: Inbound Email Webhook
 * 
 * Normalizes provider-specific payloads (Gmail, Outlook, Mailgun, etc.)
 * and forwards to Supabase Edge Function for AI reply detection.
 * 
 * Expected normalized payload shape:
 * {
 *   provider: "gmail" | "outlook" | "mailgun" | ...
 *   message_id: string (inbound message ID)
 *   in_reply_to: string (original Message-ID header)
 *   thread_id: string (thread/conversation ID)
 *   from: string (sender email)
 *   to: string[] (recipient emails)
 *   subject: string
 *   text: string (plain text body)
 * }
 */
export async function POST(req: NextRequest) {
  try {
    // Optional: verify webhook signature
    const webhookSecret = process.env.INBOUND_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = req.headers.get('x-webhook-signature');
      if (!signature || signature !== webhookSecret) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    // Parse incoming payload (may be JSON or form-data)
    let rawPayload: any;
    const contentType = req.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      rawPayload = await req.json();
    } else {
      // Handle form-urlencoded (e.g., Mailgun)
      const body = await req.text();
      rawPayload = Object.fromEntries(new URLSearchParams(body));
      // Mailgun sends message-headers as JSON string
      if (rawPayload['message-headers']) {
        try {
          rawPayload['message-headers'] = JSON.parse(rawPayload['message-headers']);
        } catch {}
      }
    }

    // Normalize payload based on provider detection
    let provider: 'gmail' | 'outlook' | 'mailgun' | string = 'gmail';
    
    // Detect provider
    if (req.headers.get('x-mailgun-signature')) {
      provider = 'mailgun';
    } else if (rawPayload.type === 'email.received') {
      provider = 'mailersend';
    } else if (rawPayload.provider) {
      provider = rawPayload.provider;
    }

    // Helper to extract nested values
    const pick = (obj: any, path: string, def: any = null): any => {
      try {
        return path.split('.').reduce((acc, key) => acc?.[key], obj) ?? def;
      } catch {
        return def;
      }
    };

    // Extract normalized fields (support multiple provider shapes)
    const normalized = {
      provider,
      message_id: 
        rawPayload.message_id || 
        rawPayload.messageId ||
        rawPayload['Message-Id'] ||
        pick(rawPayload, 'headers.Message-Id') ||
        pick(rawPayload, 'message-headers.Message-Id') ||
        null,
      in_reply_to:
        rawPayload.in_reply_to ||
        rawPayload.inReplyTo ||
        rawPayload['In-Reply-To'] ||
        pick(rawPayload, 'headers.In-Reply-To') ||
        pick(rawPayload, 'message-headers.In-Reply-To') ||
        null,
      thread_id:
        rawPayload.thread_id ||
        rawPayload.threadId ||
        pick(rawPayload, 'thread_id') ||
        pick(rawPayload, 'headers.Thread-Id') ||
        null,
      from:
        rawPayload.from ||
        rawPayload.sender ||
        rawPayload['From'] ||
        pick(rawPayload, 'headers.From') ||
        pick(rawPayload, 'message-headers.From') ||
        (typeof rawPayload.from_email === 'string' ? rawPayload.from_email : null) ||
        '',
      to: Array.isArray(rawPayload.to)
        ? rawPayload.to
        : rawPayload.to
        ? [rawPayload.to]
        : rawPayload.recipient
        ? [rawPayload.recipient]
        : pick(rawPayload, 'headers.To')
        ? [pick(rawPayload, 'headers.To')]
        : pick(rawPayload, 'message-headers.To')
        ? [pick(rawPayload, 'message-headers.To')]
        : [],
      subject:
        rawPayload.subject ||
        rawPayload.Subject ||
        pick(rawPayload, 'headers.Subject') ||
        pick(rawPayload, 'message-headers.Subject') ||
        '',
      text:
        rawPayload.text ||
        rawPayload.body ||
        rawPayload.body_text ||
        rawPayload['body-plain'] ||
        pick(rawPayload, 'body.plain') ||
        '',
    };

    // Validate required fields
    if (!normalized.from || (!normalized.text && !normalized.subject)) {
      return NextResponse.json(
        { error: 'Missing required fields: from, and (text or subject)' },
        { status: 400 }
      );
    }

    // Forward to AI Labeler Edge Function (classifies and inserts with correct flags)
    const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-labeler`;
    
    const webhookSecret = process.env.REPLY_WEBHOOK_SECRET || process.env.INBOUND_WEBHOOK_SECRET;
    
    const functionResponse = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(webhookSecret ? { 'x-reply-secret': webhookSecret } : {}),
      },
      body: JSON.stringify(normalized),
    });

    const functionData = await functionResponse.json();
    
    return NextResponse.json(functionData, { 
      status: functionResponse.status 
    });

  } catch (error: any) {
    console.error('Error processing inbound email:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error.message || String(error)
      },
      { status: 500 }
    );
  }
}
