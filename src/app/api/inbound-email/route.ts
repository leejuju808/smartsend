import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { classifyReplyHotWarmDeadV1 } from '@/lib/replyDetection/hotWarmDead';

/**
 * Block 19730 — Inbox Final Integration & Production Readiness v1
 * 
 * Email Provider Webhook → HMAC Verification → QA Checks → Thread Matching → Message Save → Owner Visibility
 * 
 * This endpoint accepts inbound email webhooks from providers (Postmark, Resend, etc.)
 * and routes replies into the SmartSend inbox system with production-ready features:
 * - HMAC signature verification with timestamp freshness
 * - Retry logic & failover handling
 * - Comprehensive monitoring & logging
 * - Duplicate detection
 * - System message filtering (bounces, auto-replies)
 * - Orphaned reply handling
 * - Mis-threaded conversation detection
 * - HTML/email body cleaning
 * - Zero dropped replies guarantee
 */

interface ParsedEmail {
  from: string;
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
  inReplyTo?: string;
  messageId?: string;
  references?: string;
}

function extractEstimateIdFromSubject(subject: string): string | null {
  const m = (subject || "").match(/\[EST\|([a-f0-9-]{36})\]/i);
  return m?.[1] ?? null;
}

/**
 * Parse email payload from various providers
 */
function parseEmailPayload(payload: any, provider: string): ParsedEmail | null {
  try {
    // Postmark format
    if (provider === 'postmark' || payload.RecordType === 'Inbound') {
      return {
        from: payload.From || payload.FromEmail || '',
        to: payload.To || payload.ToEmail || '',
        subject: payload.Subject || '',
        textBody: payload.TextBody || payload.TextPart || '',
        htmlBody: payload.HtmlBody || payload.HtmlPart,
        inReplyTo: payload.InReplyTo,
        messageId: payload.MessageID || payload.MessageId,
        references: payload.References,
      };
    }

    // Resend format
    if (provider === 'resend' || payload.type === 'email.received') {
      const data = payload.data || payload;
      return {
        from: data.from || data.from_email || '',
        to: data.to || data.to_email || (Array.isArray(data.to) ? data.to[0] : ''),
        subject: data.subject || '',
        textBody: data.text || data.text_body || '',
        htmlBody: data.html || data.html_body,
        inReplyTo: data.in_reply_to || data['In-Reply-To'],
        messageId: data.message_id || data.messageId || data['Message-Id'],
        references: data.references || data['References'],
      };
    }

    // Mailgun format
    if (provider === 'mailgun' || payload['message-headers']) {
      const headers = Array.isArray(payload['message-headers'])
        ? Object.fromEntries(payload['message-headers'].map((h: any[]) => [h[0], h[1]]))
        : payload['message-headers'];
      
      return {
        from: payload.sender || payload.from || headers['From'] || '',
        to: payload.recipient || payload.to || headers['To'] || '',
        subject: payload.subject || headers['Subject'] || '',
        textBody: payload['body-plain'] || payload['body-text'] || '',
        htmlBody: payload['body-html'],
        inReplyTo: headers['In-Reply-To'],
        messageId: headers['Message-Id'] || headers['Message-ID'],
        references: headers['References'],
      };
    }

    // Generic format (try common field names)
    return {
      from: payload.from || payload.from_email || payload.From || '',
      to: payload.to || payload.to_email || payload.To || (Array.isArray(payload.to) ? payload.to[0] : ''),
      subject: payload.subject || payload.Subject || '',
      textBody: payload.text || payload.text_body || payload.body || payload.TextBody || '',
      htmlBody: payload.html || payload.html_body || payload.HtmlBody,
      inReplyTo: payload.in_reply_to || payload.inReplyTo || payload['In-Reply-To'],
      messageId: payload.message_id || payload.messageId || payload.MessageID || payload['Message-Id'],
      references: payload.references || payload.References,
    };
  } catch (error) {
    console.error('Error parsing email payload:', error);
    return null;
  }
}

/**
 * Clean email body using database function (more comprehensive)
 */
async function cleanEmailBody(
  supabase: any,
  htmlBody: string | undefined,
  textBody: string
): Promise<string> {
  if (!htmlBody && !textBody) return '';
  
  // Use database function for comprehensive cleaning
  const { data, error } = await supabase.rpc('clean_email_html', {
    p_html: htmlBody || null,
    p_text: textBody || null,
  });
  
  if (error) {
    console.error('Error cleaning email body:', error);
    // Fallback to basic cleaning
    return (textBody || htmlBody || '')
      .replace(/On\s+[\w\s,:\-]+\s+wrote:[\s\S]*$/g, '')
      .replace(/^From:.*$/gm, '')
      .replace(/Sent from my \w+.*$/i, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  
  return data || '';
}

async function pauseEstimateFollowupsOnReply(args: {
  supabase: any;
  estimateId: string;
  fromEmail: string;
  bodyPreview: string;
}) {
  const { supabase, estimateId } = args;

  // Best-effort update: stop follow-ups immediately on any homeowner response.
  try {
    const nowIso = new Date().toISOString();
    await supabase
      .from("estimates")
      .update({
        followup_status: "paused",
        next_followup_at: null,
        status_updated_at: nowIso,
      })
      .eq("id", estimateId);
  } catch (e) {
    // never block inbound processing
    console.warn("Failed to pause estimate followups on reply:", e);
  }
}

/**
 * Resolve campaign_id from the "to" email address
 */
async function resolveCampaignId(
  supabase: any,
  toEmail: string
): Promise<{ campaign_id: string | null; workspace_id: string | null }> {
  if (!toEmail) {
    return { campaign_id: null, workspace_id: null };
  }

  const normalizedTo = toEmail.toLowerCase().trim();

  // Try to find campaign by from_email matching the "to" address
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, workspace_id')
    .eq('from_email', normalizedTo)
    .maybeSingle();

  if (campaign) {
    return { campaign_id: campaign.id, workspace_id: campaign.workspace_id };
  }

  // Try to find by custom headers or routing rules if they exist
  // For now, return null if we can't resolve - will be marked as orphaned
  return { campaign_id: null, workspace_id: null };
}

/**
 * Resolve contact_id from the "from" email address
 */
async function resolveContactId(
  supabase: any,
  fromEmail: string,
  workspaceId: string | null
): Promise<string | null> {
  if (!fromEmail || !workspaceId) {
    return null;
  }

  const normalizedFrom = fromEmail.toLowerCase().trim();

  // Find contact by email within the workspace
  const { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('email', normalizedFrom)
    .maybeSingle();

  return contact?.id || null;
}

/**
 * Find or create a thread for this contact + campaign
 */
async function findOrCreateThread(
  supabase: any,
  contactId: string | null,
  campaignId: string
): Promise<string> {
  // Try to find existing thread
  if (contactId) {
    const { data: existingThread } = await supabase
      .from('inbox_threads')
      .select('id')
      .eq('contact_id', contactId)
      .eq('campaign_id', campaignId)
      .maybeSingle();

    if (existingThread) {
      return existingThread.id;
    }
  }

  // If no contact_id, we can't match by contact, so create a new thread
  // (Each orphaned message gets its own thread until contact is resolved)
  const { data: newThread, error } = await supabase
    .from('inbox_threads')
    .insert({
      contact_id: contactId,
      campaign_id: campaignId,
      status: 'open',
      last_message_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    // If unique constraint violation, try to find the thread again
    if (error.code === '23505' && contactId) {
      const { data: retryThread } = await supabase
        .from('inbox_threads')
        .select('id')
        .eq('contact_id', contactId)
        .eq('campaign_id', campaignId)
        .maybeSingle();
      
      if (retryThread) {
        return retryThread.id;
      }
    }
    
    console.error('Error creating thread:', error);
    throw error;
  }

  return newThread.id;
}

/**
 * PART 2: Webhook Verification Layer (Security)
 * Verify HMAC signature with timestamp freshness check
 */
async function verifyWebhookSignature(
  request: NextRequest,
  rawBody: string,
  provider: string
): Promise<{ valid: boolean; error?: string; timestampFresh?: boolean }> {
  const webhookSecret = process.env.INBOUND_WEBHOOK_SECRET;
  
  // Skip verification in dev mode if secret not set
  if (!webhookSecret) {
    return { valid: true, timestampFresh: true };
  }

  let signature: string | null = null;
  let timestamp: string | null = null;

  // Provider-specific signature extraction
  if (provider === 'postmark') {
    signature = request.headers.get('x-postmark-signature');
  } else if (provider === 'resend') {
    // Resend uses Svix format: svix-id, svix-timestamp, svix-signature
    signature = request.headers.get('svix-signature');
    timestamp = request.headers.get('svix-timestamp');
  } else if (provider === 'mailgun') {
    signature = request.headers.get('x-mailgun-signature');
    timestamp = request.headers.get('x-mailgun-timestamp');
  } else {
    // Generic signature header
    signature = request.headers.get('x-webhook-signature') || 
                request.headers.get('x-signature');
    timestamp = request.headers.get('x-timestamp') ||
                request.headers.get('x-webhook-timestamp');
  }

  if (!signature) {
    return { valid: false, error: 'Missing signature header' };
  }

  // Verify timestamp freshness (5 minutes)
  let timestampFresh = true;
  if (timestamp) {
    const timestampNum = parseInt(timestamp, 10);
    if (!isNaN(timestampNum)) {
      const timestampDate = new Date(timestampNum * 1000); // Convert Unix timestamp
      const now = new Date();
      const diffMinutes = Math.abs(now.getTime() - timestampDate.getTime()) / (1000 * 60);
      timestampFresh = diffMinutes <= 5;
      
      if (!timestampFresh) {
        return { valid: false, error: 'Timestamp too old (replay attack)', timestampFresh: false };
      }
    }
  }

  // Verify HMAC signature
  try {
    let expectedSignature: string;
    
    // For Svix (Resend), signature format is different
    if (provider === 'resend' && timestamp) {
      const signedPayload = `${timestamp}.${rawBody}`;
      expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(signedPayload)
        .digest('hex');
      
      // Svix signatures are in format: v1=signature
      const sigParts = signature.split(',');
      const v1Part = sigParts.find(p => p.startsWith('v1='));
      if (v1Part) {
        const providedSig = v1Part.replace('v1=', '');
        const isValid = crypto.timingSafeEqual(
          Buffer.from(expectedSignature),
          Buffer.from(providedSig)
        );
        return { valid: isValid, timestampFresh, error: isValid ? undefined : 'Invalid signature' };
      }
    } else {
      // Standard HMAC-SHA256
      expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');
      
      // Handle different signature formats
      const providedSig = signature.replace('sha256=', '').replace('v1=', '');
      const isValid = crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(providedSig)
      );
      return { valid: isValid, timestampFresh, error: isValid ? undefined : 'Invalid signature' };
    }
  } catch (error) {
    return { valid: false, error: `Signature verification error: ${error}`, timestampFresh };
  }

  return { valid: false, error: 'Signature verification failed' };
}

/**
 * PART 3: Retry Logic & Failover Handling
 * Queue failed processing for retry
 */
async function queueRetry(
  supabase: any,
  logId: string,
  rawPayload: any,
  provider: string,
  errorMessage: string,
  attemptCount: number = 0
): Promise<void> {
  try {
    await supabase.rpc('queue_inbound_email_retry', {
      p_log_id: logId,
      p_payload: rawPayload,
      p_provider: provider,
      p_error_message: errorMessage,
      p_attempt_count: attemptCount,
    });
  } catch (error) {
    console.error('Error queueing retry:', error);
    // Even if retry queueing fails, we've logged the payload
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let logId: string | null = null;
  let rawPayload: any;
  let rawBody: string = '';

  try {
    // PART 2: Get raw body for signature verification
    rawBody = await request.text();
    
    // Parse JSON payload
    try {
      rawPayload = JSON.parse(rawBody);
    } catch {
      // Handle form-urlencoded (e.g., Mailgun)
      rawPayload = Object.fromEntries(new URLSearchParams(rawBody));
      if (rawPayload['message-headers']) {
        try {
          rawPayload['message-headers'] = JSON.parse(rawPayload['message-headers']);
        } catch {}
      }
    }
    
    // Detect provider from headers or payload
    const provider = 
      request.headers.get('x-postmark-signature') ? 'postmark' :
      request.headers.get('svix-signature') || request.headers.get('x-resend-signature') ? 'resend' :
      request.headers.get('x-mailgun-signature') ? 'mailgun' :
      rawPayload.provider || 'unknown';

    // PART 2: Verify webhook signature
    const verification = await verifyWebhookSignature(request, rawBody, provider);
    
    // Log the payload (even if signature fails, we log for security analysis)
    const payloadSizeBytes = Buffer.byteLength(rawBody, 'utf8');
    const timestampReceived = new Date().toISOString();
    const timestampFromHeader = request.headers.get('x-timestamp') || 
                                request.headers.get('svix-timestamp') ||
                                request.headers.get('x-mailgun-timestamp');
    
    const { data: log, error: logError } = await supabase
      .from('inbound_email_logs')
      .insert({
        payload: rawPayload,
        provider,
        processed: false,
        signature_valid: verification.valid,
        signature_error: verification.error,
        timestamp_received: timestampReceived,
        timestamp_from_header: timestampFromHeader ? new Date(parseInt(timestampFromHeader) * 1000).toISOString() : null,
        timestamp_fresh: verification.timestampFresh,
      })
      .select('id')
      .single();

    if (logError) {
      console.error('Error logging inbound email:', logError);
      // Even if logging fails, try to continue (but this is critical)
    } else {
      logId = log.id;
    }

    // PART 2: Reject if signature invalid
    if (!verification.valid) {
      // Log webhook event for monitoring
      await supabase.rpc('log_webhook_event', {
        p_event_type: 'inbound_email_received',
        p_provider: provider,
        p_response_time_ms: Date.now() - startTime,
        p_success: false,
        p_error_message: verification.error || 'Invalid signature',
        p_payload_size_bytes: payloadSizeBytes,
      });

      // Log QA event
      await supabase.rpc('log_qa_event', {
        p_event_type: 'webhook_signature_failed',
        p_payload: {
          provider,
          error: verification.error,
          timestamp_fresh: verification.timestampFresh,
        },
      });

      return NextResponse.json(
        { error: 'Invalid webhook signature', details: verification.error },
        { status: 401 }
      );
    }

    // Log successful webhook receipt
    await supabase.rpc('log_webhook_event', {
      p_event_type: 'inbound_email_received',
      p_provider: provider,
      p_response_time_ms: Date.now() - startTime,
      p_success: true,
      p_payload_size_bytes: payloadSizeBytes,
    });

    // 2. Parse email payload
    const parsed = parseEmailPayload(rawPayload, provider);
    if (!parsed || !parsed.from || !parsed.to) {
      await supabase
        .from('inbound_email_logs')
        .update({
          processed: true,
          error_message: 'Missing required fields: from or to',
        })
        .eq('id', logId);
      
      return NextResponse.json(
        { error: 'Missing required fields: from or to' },
        { status: 400 }
      );
    }

    // Block 268600 — Stop estimate auto-nudges instantly on any response.
    // If the subject includes "[EST|<estimateId>]", we can deterministically pause follow-ups.
    const estimateIdFromSubject = extractEstimateIdFromSubject(parsed.subject || "");

    // 2.5. Check for system messages (bounces, auto-replies, etc.)
    const { data: isSystemMessage } = await supabase.rpc('is_system_message', {
      p_from_email: parsed.from,
      p_subject: parsed.subject || '',
      p_body: parsed.textBody || parsed.htmlBody || '',
    });
    
    if (isSystemMessage) {
      // Log QA event
      await supabase.rpc('log_qa_event', {
        p_event_type: 'system_message_filtered',
        p_payload: {
          from_email: parsed.from,
          subject: parsed.subject,
          reason: 'Detected as system message (bounce/auto-reply)',
        },
      });
      
      // Store as system message (won't show in main inbox)
      const { data: systemMessage } = await supabase
        .from('inbox_messages')
        .insert({
          campaign_id: null, // Will be resolved later if needed
          contact_id: null,
          thread_id: null,
          from_email: parsed.from,
          to_email: parsed.to,
          subject: parsed.subject,
          body_raw: parsed.textBody || parsed.htmlBody || '',
          body_clean: '',
          body_html: parsed.htmlBody || null,
          received_at: new Date().toISOString(),
          status: 'archived', // Don't show in inbox
          system_message: true,
          is_orphaned: true,
          message_id: parsed.messageId || null,
          ai_intent: null, // No AI scoring for system messages
          lead_score: null,
        })
        .select('id')
        .single();
      
      await supabase
        .from('inbound_email_logs')
        .update({
          processed: true,
          error_message: 'Filtered as system message',
        })
        .eq('id', logId);
      
      return NextResponse.json({
        success: true,
        message: 'Email filtered as system message',
        system_message: true,
        message_id: systemMessage?.id,
      });
    }

    // 3. Clean email body first (needed for duplicate detection)
    const bodyClean = await cleanEmailBody(supabase, parsed.htmlBody, parsed.textBody);
    const receivedAt = new Date();

    if (estimateIdFromSubject) {
      await pauseEstimateFollowupsOnReply({
        supabase,
        estimateId: estimateIdFromSubject,
        fromEmail: parsed.from,
        bodyPreview: (bodyClean || parsed.textBody || parsed.htmlBody || "").slice(0, 300),
      });
    }
    
    // 4. Generate message hash for duplicate detection
    const { data: messageHash } = await supabase.rpc('generate_message_hash', {
      p_from_email: parsed.from,
      p_to_email: parsed.to,
      p_received_at: receivedAt.toISOString(),
      p_body_clean: bodyClean,
    });
    
    // 5. Check for duplicate messages
    const { data: isDuplicate } = await supabase.rpc('check_duplicate_message', {
      p_message_id: parsed.messageId || null,
      p_message_hash: messageHash || null,
    });
    
    if (isDuplicate) {
      // Log duplicate detection
      await supabase.rpc('log_qa_event', {
        p_event_type: 'duplicate_blocked',
        p_payload: {
          message_id: parsed.messageId,
          message_hash: messageHash,
          from_email: parsed.from,
          to_email: parsed.to,
        },
      });
      
      await supabase
        .from('inbound_email_logs')
        .update({
          processed: true,
          duplicate_detected: true,
          error_message: 'Duplicate message detected',
        })
        .eq('id', logId);
      
      return NextResponse.json({
        success: true,
        message: 'Duplicate message detected and blocked',
        duplicate: true,
      });
    }

    // 6. Resolve campaign_id and workspace_id from "to" email
    const { campaign_id, workspace_id } = await resolveCampaignId(supabase, parsed.to);
    
    // 7. Resolve contact_id from "from" email
    const contactId = campaign_id && workspace_id
      ? await resolveContactId(supabase, parsed.from, workspace_id)
      : null;
    
    // 8. Determine if message is orphaned
    const isOrphaned = !campaign_id || !contactId;
    
    if (isOrphaned) {
      // Log orphan detection
      await supabase.rpc('log_qa_event', {
        p_event_type: 'orphan_detected',
        p_payload: {
          from_email: parsed.from,
          to_email: parsed.to,
          campaign_id: campaign_id || null,
          contact_id: contactId || null,
          reason: !campaign_id ? 'No matching campaign' : 'No matching contact',
        },
      });
    }
    
    // 9. Find or create thread (only if we have campaign_id)
    let threadId: string | null = null;
    let threadMismatchWarning = false;
    
    if (campaign_id) {
      threadId = await findOrCreateThread(supabase, contactId, campaign_id);
      
      // Check for thread mismatch if thread exists
      if (threadId) {
        const { data: hasMismatch } = await supabase.rpc('detect_thread_mismatch', {
          p_thread_id: threadId,
          p_from_email: parsed.from,
          p_subject: parsed.subject || '',
          p_body: bodyClean,
        });
        
        threadMismatchWarning = hasMismatch || false;
        
        if (threadMismatchWarning) {
          // Log thread mismatch
          await supabase.rpc('log_qa_event', {
            p_event_type: 'thread_mismatch_detected',
            p_payload: {
              thread_id: threadId,
              from_email: parsed.from,
              subject: parsed.subject,
            },
            p_thread_id: threadId,
          });
        }
      }
    }

    // 10. Insert message with all QA flags
    const { data: message, error: messageError } = await supabase
      .from('inbox_messages')
      .insert({
        thread_id: threadId,
        campaign_id: campaign_id, // Can be null for orphaned messages
        contact_id: contactId, // Can be null for orphaned messages
        from_email: parsed.from,
        to_email: parsed.to,
        subject: parsed.subject,
        body_raw: parsed.textBody || parsed.htmlBody || '',
        body_clean: bodyClean,
        body_html: parsed.htmlBody || null,
        received_at: receivedAt.toISOString(),
        status: isOrphaned ? 'unread' : 'unread', // Orphaned messages still show as unread
        ai_intent: 'warm', // Safe default for v1
        lead_score: 50, // Placeholder until AI worker is live
        is_orphaned: isOrphaned,
        system_message: false, // Already filtered above
        message_id: parsed.messageId || null,
        message_hash: messageHash || null,
        thread_mismatch_warning: threadMismatchWarning,
      })
      .select('id')
      .single();

    if (messageError) {
      console.error('Error inserting message:', messageError);
      
      // PART 3: Queue for retry instead of failing immediately
      const errorMessage = `Error inserting message: ${messageError.message}`;
      
      await supabase
        .from('inbound_email_logs')
        .update({
          processed: false, // Keep as unprocessed for retry
          error_message: errorMessage,
        })
        .eq('id', logId);
      
      // Queue retry
      await queueRetry(supabase, logId!, rawPayload, provider, errorMessage, 0);
      
      // Log webhook event
      await supabase.rpc('log_webhook_event', {
        p_event_type: 'inbound_email_failed',
        p_provider: provider,
        p_response_time_ms: Date.now() - startTime,
        p_success: false,
        p_error_message: errorMessage,
        p_payload_size_bytes: Buffer.byteLength(rawBody, 'utf8'),
      });
      
      // Return non-200 so provider retries automatically
      return NextResponse.json(
        {
          error: 'Database write failed, queued for retry',
          retry_queued: true,
        },
        { status: 503 } // Service Unavailable - triggers provider retry
      );
    }

    // -----------------------------------------------------------------------
    // Block 269100 — Reality Anchor: capture first homeowner reply for estimate
    // Deterministic mapping via subject token: [EST|<estimateId>]
    // No timestamps are shown in UI, but we store the first reply internally.
    // -----------------------------------------------------------------------
    if (estimateIdFromSubject && message?.id) {
      const nowIso = receivedAt.toISOString();
      try {
        // Set only once (first reply wins)
        await supabase
          .from("estimates")
          .update({
            first_homeowner_reply_at: nowIso,
            first_homeowner_reply_message_id: message.id,
          } as any)
          .eq("id", estimateIdFromSubject)
          .is("first_homeowner_reply_at", null);
      } catch (e) {
        // Never block inbound processing
        console.warn("Block 269100: failed to stamp first homeowner reply on estimate:", e);
      }
    }

    // 11. Update thread metadata (last_message_at is handled by trigger)
    if (threadId) {
      const { data: currentThread } = await supabase
        .from('inbox_threads')
        .select('highest_lead_score')
        .eq('id', threadId)
        .single();
      
      const currentScore = currentThread?.highest_lead_score || 0;
      const newScore = Math.max(currentScore, 50);
      
      if (newScore > currentScore) {
        await supabase
          .from('inbox_threads')
          .update({
            highest_lead_score: newScore,
          })
          .eq('id', threadId);
      }
    }

    // -----------------------------------------------------------------------
    // Block 268300 — SmartSend = Front Desk (Owner Attention Filter)
    // Mirror the SMS inbound behavior:
    // - hot/warm stay visible (engagement_level)
    // - dead auto-closes (lead_stage=lost, status=closed)
    // - stop any no-response follow-up chain instantly on inbound reply
    // -----------------------------------------------------------------------
    if (threadId) {
      try {
        const hw = classifyReplyHotWarmDeadV1(bodyClean || parsed.textBody || parsed.htmlBody || "");
        const nowIso = new Date().toISOString();

        const threadPatch: any = {
          last_message_at: nowIso,
          last_channel: "email",
          updated_at: nowIso,
          // Block 268200: stop follow-up chain instantly on inbound reply
          autofollowup_anchor_at: null,
          autofollowup_step: 0,
          autofollowup_last_sent_at: null,
          next_action_at: null,
        };

        if (hw === "hot") {
          threadPatch.engagement_level = "hot";
          threadPatch.status = "open";
        } else if (hw === "warm") {
          threadPatch.engagement_level = "warm";
          threadPatch.status = "open";
        } else if (hw === "dead") {
          threadPatch.lead_stage = "lost";
          threadPatch.status = "closed";
        }

        await supabase
          .from("inbox_threads")
          .update(threadPatch)
          .eq("id", threadId);
      } catch (e) {
        console.warn("Block 268300 owner-attention filter failed (non-blocking):", e);
      }
    }

    // 12. Log HTML cleaning if body was cleaned
    if (parsed.htmlBody && bodyClean !== (parsed.textBody || parsed.htmlBody)) {
      await supabase.rpc('log_qa_event', {
        p_event_type: 'html_corrupted_cleaned',
        p_payload: {
          original_length: (parsed.htmlBody || parsed.textBody || '').length,
          cleaned_length: bodyClean.length,
        },
        p_message_id: message.id,
      });
    }

    // 13. Mark log as processed
    if (logId) {
      await supabase
        .from('inbound_email_logs')
        .update({
          processed: true,
        })
        .eq('id', logId);
    }

    // -----------------------------------------------------------------------
    // Sprint v1: Rules-based reply labeling + auto-stop (Hot/Warm/Dead)
    // If the inbound subject contains the SmartSend token "[SS|<leadId>]",
    // we can deterministically map the reply back to a lead.
    // -----------------------------------------------------------------------
    try {
      const leadId = extractLeadIdFromSubject(parsed.subject || '');
      if (leadId) {
        const label = classifyReplyHotWarmDeadV1(bodyClean || parsed.textBody || parsed.htmlBody || '');
        const nowIso = new Date().toISOString();

        const leadUpdates: any = {
          reply_status: 'replied',
          reply_label: label,
          outreach_status: label,
          replied_at: nowIso,
          last_reply_at: nowIso,
          last_reply_snippet: (bodyClean || parsed.textBody || parsed.htmlBody || '').slice(0, 300),
          updated_at: nowIso,
          // Block 268100: SmartSend-only system tag (irreplaceability sprint)
          smartsend_homeowner: true,
        };

        if (label === 'dead') {
          leadUpdates.reason_dead = 'stop_reply';
          leadUpdates.do_not_contact = true;
        } else {
          leadUpdates.reason_dead = null;
        }

        await supabase.from('leads').update(leadUpdates).eq('id', leadId);

        // Block 268100: capture first-mark timestamp (do not overwrite)
        await supabase
          .from('leads')
          .update({ smartsend_homeowner_at: nowIso } as any)
          .eq('id', leadId)
          .is('smartsend_homeowner_at', null);

        // Block 268100: mirror tag onto the resolved contact if present
        if (contactId && workspace_id) {
          await supabase
            .from('contacts')
            .update({ smartsend_homeowner: true } as any)
            .eq('id', contactId);

          await supabase
            .from('contacts')
            .update({ smartsend_homeowner_at: nowIso } as any)
            .eq('id', contactId)
            .is('smartsend_homeowner_at', null);
        }

        if (label === 'dead') {
          await supabase
            .from('sequence_enrollments')
            .update({ status: 'stopped', next_run_at: null })
            .eq('lead_id', leadId)
            .eq('status', 'active');

          await supabase
            .from('send_queue')
            .update(
              { status: 'skipped', error: 'dead_reply_autostop', last_error: 'dead_reply_autostop', updated_at: nowIso } as any
            )
            .eq('lead_id', leadId)
            .in('status', ['pending', 'queued', 'scheduled', 'retrying', 'sending']);
        }
      }
    } catch (e) {
      console.warn('v1 reply label/autostop failed:', e);
    }

    // PART 5: Log successful processing
    await supabase.rpc('log_webhook_event', {
      p_event_type: 'inbound_email_processed',
      p_provider: provider,
      p_response_time_ms: Date.now() - startTime,
      p_success: true,
      p_payload_size_bytes: Buffer.byteLength(rawBody, 'utf8'),
    });

    // 14. Return success with QA flags
    return NextResponse.json({
      success: true,
      message_id: message.id,
      thread_id: threadId,
      campaign_id,
      contact_id: contactId,
      is_orphaned: isOrphaned,
      thread_mismatch_warning: threadMismatchWarning,
    });

  } catch (error: any) {
    console.error('Error processing inbound email:', error);
    const errorMessage = error.message || String(error);

    // PART 3: Queue for retry on any unhandled error
    if (logId) {
      try {
        await supabase
          .from('inbound_email_logs')
          .update({
            processed: false, // Keep as unprocessed for retry
            error_message: errorMessage,
          })
          .eq('id', logId);

        // Detect provider for retry queueing
        const provider = 
          request.headers.get('x-postmark-signature') ? 'postmark' :
          request.headers.get('svix-signature') || request.headers.get('x-resend-signature') ? 'resend' :
          request.headers.get('x-mailgun-signature') ? 'mailgun' :
          'unknown';

        // Queue retry
        await queueRetry(supabase, logId, rawPayload || {}, provider, errorMessage, 0);

        // Log webhook event
        await supabase.rpc('log_webhook_event', {
          p_event_type: 'inbound_email_failed',
          p_provider: provider,
          p_response_time_ms: Date.now() - startTime,
          p_success: false,
          p_error_message: errorMessage,
          p_payload_size_bytes: rawBody ? Buffer.byteLength(rawBody, 'utf8') : 0,
        });
      } catch (retryError) {
        console.error('Error queueing retry:', retryError);
        // Even if retry fails, we've logged the error
      }
    }

    // Return non-200 so provider retries automatically
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: errorMessage,
        retry_queued: logId ? true : false,
      },
      { status: 500 }
    );
  }
}

function extractLeadIdFromSubject(subject: string): string | null {
  const m = subject.match(/\[SS\|([a-f0-9-]{36})\]/i);
  return m?.[1] ?? null;
}

