/**
 * Thread Management Utilities
 * Functions for normalizing subjects, trimming quoted emails, and managing threads
 */

/**
 * Normalize email subject by removing "Re:" and "Fwd:" prefixes
 */
export function normalizeSubject(s?: string | null): string {
  return (s ?? "").replace(/^(re:|fwd:)\s*/gi, "").trim();
}

/**
 * Trim quoted email content from reply body
 * Removes:
 * - Text starting from "On ...wrote:"
 * - Lines starting with ">"
 * - Header clutter like "From:", "Sent:", etc.
 * Also cleans up excessive whitespace
 */
export function trimQuotedEmail(txt: string): string {
  if (!txt) return "";
  
  const lines = txt.split(/\r?\n/);
  const out: string[] = [];
  
  for (const ln of lines) {
    // Stop at quoted block start
    if (/^\s*On .+wrote:$/i.test(ln)) break;
    
    // Skip quoted lines
    if (/^\s*>/.test(ln)) continue;
    
    // Skip header clutter
    if (/^\s*(From|Sent|To|Subject):/i.test(ln)) continue;
    
    out.push(ln);
  }
  
  return out.join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 8000); // Limit to reasonable size
}

/**
 * Upsert thread and insert reply
 * This is the main function called when ingesting new replies
 */
export async function upsertThreadAndInsertReply({
  lead_id,
  campaign_id,
  subject,
  rawBody,
  fromEmail,
  supabase,
}: {
  lead_id: string;
  campaign_id: string | null;
  subject: string | null;
  rawBody: string;
  fromEmail: string | null;
  supabase: any;
}) {
  const normSubj = normalizeSubject(subject);
  const body = trimQuotedEmail(rawBody);

  // 1) Find or create thread
  // Note: The unique index is on (lead_id, lower(subject))
  // Supabase doesn't support computed columns in onConflict, so we query first
  let thread;
  const { data: existing, error: findError } = await supabase
    .from("threads")
    .select("id, unread_count")
    .eq("lead_id", lead_id)
    .eq("subject", normSubj)  // Match on already-normalized subject
    .maybeSingle();

  if (existing) {
    // Update existing thread
    const { data: updated, error: updateError } = await supabase
      .from("threads")
      .update({
        last_message_snippet: body.slice(0, 240),
        last_message_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("id, unread_count")
      .single();
    
    if (updateError) {
      throw new Error(`Failed to update thread: ${updateError.message}`);
    }
    thread = updated;
  } else {
    // Create new thread
    const { data: created, error: createError } = await supabase
      .from("threads")
      .insert({
        lead_id,
        campaign_id,
        subject: normSubj,
        last_message_snippet: body.slice(0, 240),
        last_message_at: new Date().toISOString(),
      })
      .select("id, unread_count")
      .single();
    
    if (createError) {
      throw new Error(`Failed to create thread: ${createError.message}`);
    }
    thread = created;
  }

  // 2) Insert reply
  const { data: reply, error: replyError } = await supabase
    .from("replies")
    .insert({
      lead_id,
      thread_id: thread.id,
      subject: normSubj,
      body,
      raw_body: rawBody,
      from_email: fromEmail ?? null,
      is_read: false,
      is_reply: true,
    })
    .select("id")
    .single();

  if (replyError) {
    throw new Error(`Failed to insert reply: ${replyError.message}`);
  }

  // 3) Increment unread_count
  await supabase.rpc("inc_unread_for_thread", { p_thread_id: thread.id });

  return reply?.id;
}

