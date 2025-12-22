import { createClient } from '@supabase/supabase-js';
import { renderTemplate } from './template';
import { reserveAndSend } from '@/lib/sending/guard';
import { makeUnsubLink, isSuppressedFor } from '@/lib/unsub/utils';
import { nextWindowTimestamp } from './timezone';

function sbAdmin() {
  return new (createClient as any)(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function progressOne(sub: any) {
  const sb = sbAdmin();
  await sb.rpc('app.set_workspace', { id: sub.workspace_id });

  // Load sequence + next step
  const { data: seq } = await sb.from('sequences').select('*').eq('id', sub.sequence_id).maybeSingle();
  const nextStepNo = sub.current_step + 1;
  const { data: step } = await sb
    .from('sequence_steps')
    .select('*')
    .eq('sequence_id', sub.sequence_id)
    .eq('step_no', nextStepNo)
    .maybeSingle();

  if (!step) {
    await sb.from('sequence_subscribers').update({ status: 'completed', next_send_at: null }).eq('id', sub.id);
    await sb.from('sequence_events').insert({ workspace_id: sub.workspace_id, sequence_id: sub.sequence_id, subscriber_id: sub.id, type: 'completed' });
    return { done: true };
  }

  // Load contact vars
  const { data: contact } = await sb.from('contacts').select('email, first_name, last_name, meta').eq('id', sub.contact_id).maybeSingle();
  
  // Check if contact is suppressed before sending
  const sup = await isSuppressedFor(sub.workspace_id, sub.email, sub.sequence_id);
  if (sup.blocked) {
    await sb.from('sequence_subscribers').update({ 
      status: 'unsubscribed', 
      next_send_at: null 
    }).eq('id', sub.id);
    await sb.from('sequence_events').insert({ 
      workspace_id: sub.workspace_id, 
      sequence_id: sub.sequence_id, 
      subscriber_id: sub.id, 
      type: 'unsubscribed', 
      meta: { reason: sup.reason } 
    });
    return { skipped: true, reason: sup.reason };
  }

  // Build unsubscribe link and inject into body
  const unsubUrl = await makeUnsubLink(sub.workspace_id, sub.email, sub.sequence_id, sub.id);
  const vars = { contact, sequence: seq, step, unsubscribe_url: unsubUrl };

  const subject = renderTemplate(step.subject_template || 'Quick hello', vars);
  const html = renderTemplate(step.html_template || '<p>Hi {{contact.first_name}}, quick hello.</p>', vars);
  const text = renderTemplate(step.text_template || 'Hi {{contact.first_name}}, quick hello.', vars);

  // Add unsubscribe footer
  const footer = `\n\n—\nPrefer fewer emails? Manage preferences here: ${unsubUrl}`;
  const htmlFinal = html + `<br/><br/><hr/><p style="font-size:12px;color:#666">Prefer fewer emails? <a href="${unsubUrl}">Manage preferences</a>.</p>`;
  const textFinal = text + footer;

  // Guarded send
  const result = await reserveAndSend(sub.workspace_id, sub.email, async () => {
    const { sendEmail } = await import('@/lib/replies/sendEmail');
    await sendEmail({
      toEmail: sub.email,
      fromEmail: process.env.REPLY_FROM_EMAIL!,
      fromName: process.env.REPLY_FROM_NAME || 'SmartSend',
      subject,
      html: htmlFinal,
      text: textFinal,
    });
  });

  if (!result.allowed) {
    await sb.from('sequence_events').insert({ workspace_id: sub.workspace_id, sequence_id: sub.sequence_id, subscriber_id: sub.id, type: 'paused', meta: { reason: result.reason } });
    await sb.from('sequence_subscribers').update({ status: 'paused' }).eq('id', sub.id);
    return { paused: true, reason: result.reason };
  }

  // advance
  const now = new Date();
  const sequenceTimezone = seq?.timezone || 'America/Los_Angeles';
  const windowStart = step.window_start || '09:00';
  const windowEnd = step.window_end || '17:00';
  
  // Calculate next send time using timezone-aware window
  const scheduledAt = nextWindowTimestamp(now, sequenceTimezone, windowStart, windowEnd);
  
  await sb.from('sequence_subscribers').update({ 
    current_step: nextStepNo, 
    last_sent_at: now.toISOString(), 
    next_send_at: scheduledAt.toISOString() 
  }).eq('id', sub.id);
  await sb.from('sequence_events').insert({ workspace_id: sub.workspace_id, sequence_id: sub.sequence_id, subscriber_id: sub.id, type: 'sent', meta: { step: nextStepNo } });
  return { sent: true };
} 