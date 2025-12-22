/**
 * Google Apps Script: SmartSend Queue Tick Handler
 * 
 * This script runs every minute via Time-driven trigger to:
 * 1. Pull due email jobs from Supabase Edge Function
 * 2. Send emails via GmailApp
 * 3. Report success/failure back to queue
 * 
 * Setup:
 * 1. Create a new Google Apps Script project
 * 2. Paste this code
 * 3. Go to Project Settings → Script properties, add:
 *    - QUEUE_URL: https://<project>.functions.supabase.co/send-queue
 *    - QUEUE_SECRET: <your-secret-from-supabase>
 * 4. Triggers → + Add trigger:
 *    - Function: sendTick
 *    - Event: Time-driven → Every minute
 */

/**
 * Get script property (secrets)
 */
function getProp(name) {
  return PropertiesService.getScriptProperties().getProperty(name);
}

/**
 * Fetch JSON from URL with error handling
 */
function fetchJson(url, options) {
  const res = UrlFetchApp.fetch(url, {
    ...options,
    muteHttpExceptions: true
  });
  const txt = res.getContentText();
  try { 
    return JSON.parse(txt); 
  } catch (e) { 
    throw new Error(`Bad JSON from ${url}: ${txt}`);
  }
}

/**
 * Main tick function: pull, send, report
 */
function sendTick() {
  const QUEUE_URL = getProp('QUEUE_URL');
  const SECRET = getProp('QUEUE_SECRET');

  if (!QUEUE_URL || !SECRET) {
    Logger.log('Missing QUEUE_URL or QUEUE_SECRET in script properties');
    return;
  }

  try {
    // 1. Pull due items
    const { rows } = fetchJson(`${QUEUE_URL}?op=pull&limit=10`, {
      method: 'get',
      headers: { 'x-ss-secret': SECRET }
    });

    Logger.log(`Pulled ${rows.length} items`);

    // 2. Process each item
    rows.forEach((item, i) => {
      try {
        // Send via Gmail (handle both body and body_html columns)
        const htmlContent = item.body_html || item.body;
        GmailApp.sendEmail(
          item.to_email,
          item.subject,
          '', // plain text (empty for now; you can strip HTML or convert)
          { 
            htmlBody: htmlContent,
            name: "SmartSend",
            replyTo: null // add reply-to from campaign if needed
          }
        );

        // Mark as sent
        UrlFetchApp.fetch(`${QUEUE_URL}?op=sent`, {
          method: 'post',
          contentType: 'application/json',
          headers: { 'x-ss-secret': SECRET },
          payload: JSON.stringify({ queueId: item.id, providerId: null })
        });

        Logger.log(`Sent: ${item.to_email}`);
      } catch (e) {
        // Mark as failed
        UrlFetchApp.fetch(`${QUEUE_URL}?op=failed`, {
          method: 'post',
          contentType: 'application/json',
          headers: { 'x-ss-secret': SECRET },
          payload: JSON.stringify({ queueId: item.id, error: String(e) })
        });

        Logger.log(`Failed: ${item.to_email} - ${e}`);
      }

      // Gentle pacing: 400ms + random jitter
      Utilities.sleep(400 + Math.floor(Math.random() * 250));
    });
  } catch (e) {
    Logger.log(`Tick error: ${e}`);
  }
}

/**
 * Helper: Convert HTML to plain text (optional, for Apps Script email)
 */
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>.*?<\/style>/gi, '')
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

