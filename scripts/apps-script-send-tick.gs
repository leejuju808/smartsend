/**
 * Sends due emails from Supabase send_queue using Gmail.
 * Runs every minute.
 */
const QUEUE_URL = 'https://<project>.functions.supabase.co/send-queue';
const SECRET = 'YOUR_QUEUE_SECRET';

function sendTick() {
  // Pull due items
  const res = UrlFetchApp.fetch(`${QUEUE_URL}?op=pull&limit=10`, {
    method: 'get',
    headers: { 'x-ss-secret': SECRET },
    muteHttpExceptions: true,
  });
  const { rows } = JSON.parse(res.getContentText());

  rows.forEach(item => {
    try {
      GmailApp.sendEmail(item.to_email, item.subject, item.body, { name: "SmartSend" });
      // mark sent
      UrlFetchApp.fetch(`${QUEUE_URL}?op=sent`, {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-ss-secret': SECRET },
        payload: JSON.stringify({ queueId: item.id, providerId: null }),
      });
      Utilities.sleep(500); // light pacing
    } catch (e) {
      UrlFetchApp.fetch(`${QUEUE_URL}?op=failed`, {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-ss-secret': SECRET },
        payload: JSON.stringify({ queueId: item.id, error: String(e) }),
      });
    }
  });
}

/**
 * Gmail reply watcher – runs every 5 minutes.
 * Checks for new replies in inbox and notifies the reply-detect Edge Function.
 */
function checkReplies() {
  const QUEUE_URL = PropertiesService.getScriptProperties().getProperty('REPLY_URL');
  const SECRET    = PropertiesService.getScriptProperties().getProperty('QUEUE_SECRET');

  if (!QUEUE_URL || !SECRET) {
    Logger.log('ERROR: REPLY_URL or QUEUE_SECRET not set in Script Properties');
    return;
  }

  // search last 5 minutes for new messages in INBOX that are replies
  const threads = GmailApp.search('newer_than:5m in:inbox');
  threads.forEach(t => {
    const msgs = t.getMessages();
    const last = msgs[msgs.length - 1];
    if (!last.isInInbox() || !last.isUnread()) return;

    const subj = last.getSubject();
    const from = last.getFrom();
    const inReplyTo = last.getHeader('In-Reply-To');

    if (/\[SS\|[0-9a-fA-F-]+\]/.test(subj)) {
      try {
        UrlFetchApp.fetch(QUEUE_URL, {
          method: 'post',
          contentType: 'application/json',
          headers: { 'x-ss-secret': SECRET },
          payload: JSON.stringify({ from, subject: subj, inReplyTo }),
        });
        last.markRead();
        Logger.log(`Marked reply detected: ${subj.substring(0, 50)}...`);
      } catch (e) {
        Logger.log(`ERROR notifying reply-detect: ${e}`);
      }
    }
  });
}

