import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'

// Test setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key'

const supabase = createClient(supabaseUrl, supabaseKey)

describe('AI Labeler Hook - Edge Cases', () => {
  let testUserId: string
  let testCampaignId: string
  let testLeadId: string
  let testThreadId: string
  let testMailboxId: string

  beforeEach(async () => {
    // Create test user
    const { data: user } = await supabase.auth.admin.createUser({
      email: `test-${Date.now()}@example.com`,
      password: 'test-password-123',
    })
    testUserId = user?.user?.id || ''

    // Create test campaign
    const { data: campaign } = await supabase
      .from('campaigns')
      .insert({
        user_id: testUserId,
        name: 'Test Campaign',
        stop_on_reply: true,
      })
      .select('id')
      .single()
    testCampaignId = campaign?.id || ''

    // Create test lead
    const { data: lead } = await supabase
      .from('leads')
      .insert({
        email: `test-lead-${Date.now()}@example.com`,
        first_name: 'Test',
        last_name: 'Lead',
      })
      .select('id')
      .single()
    testLeadId = lead?.id || ''

    // Create test thread
    const { data: thread } = await supabase
      .from('inbox_threads')
      .insert({
        campaign_id: testCampaignId,
        lead_id: testLeadId,
        subject: 'Test Thread',
        status: 'open',
      })
      .select('id')
      .single()
    testThreadId = thread?.id || ''

    // Create test mailbox (if needed)
    const { data: mailbox } = await supabase
      .from('connected_accounts')
      .insert({
        user_id: testUserId,
        provider: 'gmail',
        email: `test-${Date.now()}@gmail.com`,
      })
      .select('id')
      .single()
    testMailboxId = mailbox?.id || ''
  })

  afterEach(async () => {
    // Cleanup
    if (testThreadId) {
      await supabase.from('inbox_messages').delete().eq('thread_id', testThreadId)
      await supabase.from('inbox_threads').delete().eq('id', testThreadId)
    }
    if (testCampaignId) {
      await supabase.from('campaigns').delete().eq('id', testCampaignId)
    }
    if (testLeadId) {
      await supabase.from('leads').delete().eq('id', testLeadId)
    }
    if (testMailboxId) {
      await supabase.from('connected_accounts').delete().eq('id', testMailboxId)
    }
    if (testUserId) {
      await supabase.auth.admin.deleteUser(testUserId)
    }
  })

  it('should NOT cancel followups when inbound OOO message is inserted', async () => {
    // Create a pending send_queue item
    const { data: queueItem } = await supabase
      .from('send_queue')
      .insert({
        campaign_id: testCampaignId,
        lead_id: testLeadId,
        status: 'pending',
        scheduled_at: new Date(Date.now() + 86400000).toISOString(), // tomorrow
      })
      .select('id')
      .single()

    expect(queueItem).toBeDefined()

    // Insert OOO message with is_human=false
    const { data: message, error: msgError } = await supabase
      .from('inbox_messages')
      .insert({
        user_id: testUserId,
        campaign_id: testCampaignId,
        thread_id: testThreadId,
        lead_id: testLeadId,
        mailbox_id: testMailboxId,
        provider: 'gmail',
        provider_msg_id: `test-ooo-${Date.now()}`,
        direction: 'in',
        from_email: 'test@example.com',
        to_email: 'recipient@example.com',
        subject: 'Out of Office',
        body_text: 'I am out of the office until next week.',
        is_human: false, // OOO is auto-reply
        reply_label: 'ooo',
      })
      .select('id')
      .single()

    expect(msgError).toBeNull()
    expect(message).toBeDefined()

    // Wait a bit for trigger to fire
    await new Promise(resolve => setTimeout(resolve, 500))

    // Verify queue item is still pending (not canceled)
    const { data: queueAfter } = await supabase
      .from('send_queue')
      .select('status')
      .eq('id', queueItem.id)
      .single()

    expect(queueAfter?.status).toBe('pending')

    // Verify no audit log for cancel_followups
    const { data: auditLogs } = await supabase
      .from('audit_logs')
      .select('action')
      .eq('thread_id', testThreadId)
      .eq('action', 'auto.cancel_followups')

    expect(auditLogs?.length).toBe(0)
  })

  it('should NOT cancel followups when inbound unsubscribe message is inserted', async () => {
    // Create a pending send_queue item
    const { data: queueItem } = await supabase
      .from('send_queue')
      .insert({
        campaign_id: testCampaignId,
        lead_id: testLeadId,
        status: 'pending',
        scheduled_at: new Date(Date.now() + 86400000).toISOString(),
      })
      .select('id')
      .single()

    // Insert unsubscribe message with is_human=false
    const { data: message, error: msgError } = await supabase
      .from('inbox_messages')
      .insert({
        user_id: testUserId,
        campaign_id: testCampaignId,
        thread_id: testThreadId,
        lead_id: testLeadId,
        mailbox_id: testMailboxId,
        provider: 'gmail',
        provider_msg_id: `test-unsub-${Date.now()}`,
        direction: 'in',
        from_email: 'test@example.com',
        to_email: 'recipient@example.com',
        subject: 'Unsubscribe',
        body_text: 'Please remove me from your mailing list.',
        is_human: false, // Unsubscribe is auto-handled
        reply_label: 'unsubscribe',
      })
      .select('id')
      .single()

    expect(msgError).toBeNull()
    expect(message).toBeDefined()

    // Wait a bit for trigger to fire
    await new Promise(resolve => setTimeout(resolve, 500))

    // Verify queue item is still pending (not canceled)
    const { data: queueAfter } = await supabase
      .from('send_queue')
      .select('status')
      .eq('id', queueItem.id)
      .single()

    expect(queueAfter?.status).toBe('pending')

    // Verify no audit log for cancel_followups
    const { data: auditLogs } = await supabase
      .from('audit_logs')
      .select('action')
      .eq('thread_id', testThreadId)
      .eq('action', 'auto.cancel_followups')

    expect(auditLogs?.length).toBe(0)
  })

  it('should NOT cancel followups when inbound bounce message is inserted', async () => {
    // Create a pending send_queue item
    const { data: queueItem } = await supabase
      .from('send_queue')
      .insert({
        campaign_id: testCampaignId,
        lead_id: testLeadId,
        status: 'pending',
        scheduled_at: new Date(Date.now() + 86400000).toISOString(),
      })
      .select('id')
      .single()

    // Insert bounce message with is_human=false
    const { data: message, error: msgError } = await supabase
      .from('inbox_messages')
      .insert({
        user_id: testUserId,
        campaign_id: testCampaignId,
        thread_id: testThreadId,
        lead_id: testLeadId,
        mailbox_id: testMailboxId,
        provider: 'gmail',
        provider_msg_id: `test-bounce-${Date.now()}`,
        direction: 'in',
        from_email: 'mailer-daemon@example.com',
        to_email: 'recipient@example.com',
        subject: 'Mail Delivery Failure',
        body_text: 'The email could not be delivered.',
        is_human: false, // Bounce is auto
        reply_label: 'bounce',
      })
      .select('id')
      .single()

    expect(msgError).toBeNull()
    expect(message).toBeDefined()

    // Wait a bit for trigger to fire
    await new Promise(resolve => setTimeout(resolve, 500))

    // Verify queue item is still pending (not canceled)
    const { data: queueAfter } = await supabase
      .from('send_queue')
      .select('status')
      .eq('id', queueItem.id)
      .single()

    expect(queueAfter?.status).toBe('pending')
  })

  it('should cancel followups when inbound human reply is inserted', async () => {
    // Create a pending send_queue item
    const { data: queueItem } = await supabase
      .from('send_queue')
      .insert({
        campaign_id: testCampaignId,
        lead_id: testLeadId,
        status: 'pending',
        scheduled_at: new Date(Date.now() + 86400000).toISOString(),
      })
      .select('id')
      .single()

    // Insert human reply with is_human=true
    const { data: message, error: msgError } = await supabase
      .from('inbox_messages')
      .insert({
        user_id: testUserId,
        campaign_id: testCampaignId,
        thread_id: testThreadId,
        lead_id: testLeadId,
        mailbox_id: testMailboxId,
        provider: 'gmail',
        provider_msg_id: `test-human-${Date.now()}`,
        direction: 'in',
        from_email: 'test@example.com',
        to_email: 'recipient@example.com',
        subject: 'Re: Test',
        body_text: 'I am interested in learning more.',
        is_human: true, // Human reply
        reply_label: 'positive',
      })
      .select('id')
      .single()

    expect(msgError).toBeNull()
    expect(message).toBeDefined()

    // Wait a bit for trigger to fire
    await new Promise(resolve => setTimeout(resolve, 500))

    // Verify queue item is canceled
    const { data: queueAfter } = await supabase
      .from('send_queue')
      .select('status')
      .eq('id', queueItem.id)
      .single()

    expect(queueAfter?.status).toBe('canceled')

    // Verify audit log for cancel_followups exists
    const { data: auditLogs } = await supabase
      .from('audit_logs')
      .select('action, meta')
      .eq('thread_id', testThreadId)
      .eq('action', 'auto.cancel_followups')

    expect(auditLogs?.length).toBeGreaterThan(0)
    expect(auditLogs?.[0]?.meta?.canceled).toBeGreaterThanOrEqual(0)
  })
})





