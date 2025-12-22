/**
 * SmartSend Gmail → Edge Function bridge (MVP)
 * 
 * SETUP INSTRUCTIONS:
 * 1. Go to script.new (Google Apps Script)
 * 2. Paste this code
 * 3. Update EDGE_FUNCTION_URL and EDGE_FUNCTION_BEARER below
 * 4. Set up trigger: Triggers → Add trigger
 *    - Function: processReplies
 *    - Event source: Time-driven
 *    - Type: Every minute (or every 5 minutes)
 * 5. Accept Gmail + URL fetch scopes when prompted
 * 
 * GMAIL SETUP (one-time):
 * 1. Create label: "SmartSend Replies"
 * 2. Create filter:
 *    - Search: subject:[SS|
 *    - Apply label: "SmartSend Replies"
 *    - Also apply to matching conversations
 * 
 * WHAT IT DOES:
 * - Finds labeled replies with token [SS|leadId] in subject
 * - Sends snippet + leadId to your Supabase Edge Function
 * - Marks the Gmail thread as processed (removes label, marks read)
 */

const EDGE_FUNCTION_URL = 'https://YOUR-SUPABASE-PROJECT.functions.supabase.co/reply-detection';
const EDGE_FUNCTION_BEARER = 'Bearer YOUR_SERVER_SIDE_KEY_OR_FUNC_KEY';
const LABEL_NAME = 'SmartSend Replies';
const TOKEN_RE = /\[SS\|([a-zA-Z0-9_\-]+)\]/; // captures leadId in [SS|leadId]

// Optional: Add a shared secret for extra security (must match REPLY_WEBHOOK_SECRET in Edge Function)
const WEBHOOK_SECRET = 'YOUR_MATCHING_SECRET'; // Set this if you configured REPLY_WEBHOOK_SECRET

function processReplies() {
  const label = GmailApp.getUserLabelByName(LABEL_NAME);
  if (!label) {
    Logger.log(`Label "${LABEL_NAME}" not found. Please create it in Gmail first.`);
    return;
  }

  // Fetch recent labeled threads (limit to last 24h to stay fast)
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const threads = label.getThreads(0, 50).filter(t => t.getLastMessageDate() >= yesterday);

  Logger.log(`Found ${threads.length} threads to process`);

  threads.forEach(thread => {
    try {
      const msgs = thread.getMessages();
      const last = msgs[msgs.length - 1];

      // Only handle messages not from you (i.e., real replies)
      const userEmail = Session.getActiveUser().getEmail();
      if (last.isDraft() || last.getFrom().includes(userEmail)) {
        return; // Skip drafts and messages from self
      }

      const subject = last.getSubject() || '';
      const m = subject.match(TOKEN_RE);
      if (!m) {
        Logger.log(`No SmartSend token found in subject: ${subject}`);
        return; // no token, skip
      }

      const leadId = m[1];
      const snippet = last.getPlainBody().slice(0, 500); // short snippet for the classifier

      // Prepare headers
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': EDGE_FUNCTION_BEARER
      };
      
      // Add secret header if configured
      if (WEBHOOK_SECRET && WEBHOOK_SECRET !== 'YOUR_MATCHING_SECRET') {
        headers['x-ss-secret'] = WEBHOOK_SECRET;
      }

      // Call Edge Function
      const payload = {
        leadId: leadId,
        emailSnippet: snippet
      };

      const res = UrlFetchApp.fetch(EDGE_FUNCTION_URL, {
        method: 'post',
        contentType: 'application/json',
        headers: headers,
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      });

      const statusCode = res.getResponseCode();
      const responseBody = res.getContentText();

      // Log result
      if (statusCode === 200) {
        Logger.log(`✅ Sent leadId=${leadId} to Edge Function. Response: ${responseBody}`);
      } else {
        Logger.log(`❌ Failed to send leadId=${leadId}. Status: ${statusCode}, Body: ${responseBody}`);
        return; // Don't mark as processed if it failed
      }

      // Mark thread as processed (remove label + mark read)
      thread.removeLabel(label);
      thread.markRead();

      Logger.log(`✓ Processed thread for leadId=${leadId}`);

    } catch (e) {
      Logger.log(`Error processing thread: ${e.toString()}`);
      // Continue with next thread even if one fails
    }
  });
}

// Test function - run this manually to test the setup
function testProcessReplies() {
  Logger.log('Running test...');
  processReplies();
  Logger.log('Test complete. Check logs above.');
}

