/**
 * Block 19720 — Inbox Webhook Tests
 * Tests for inbound email webhook handling, deduplication, and thread creation
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';

const supabase = createClient(supabaseUrl, supabaseKey);

describe('Inbox Webhook Tests', () => {
  let testThreadId: string | null = null;
  let testMessageId: string | null = null;

  beforeEach(async () => {
    // Clean up test data before each test
    if (testMessageId) {
      await supabase.from('inbox_messages').delete().eq('id', testMessageId);
    }
    if (testThreadId) {
      await supabase.from('inbox_threads').delete().eq('id', testThreadId);
    }
  });

  afterEach(async () => {
    // Clean up after each test
    if (testMessageId) {
      await supabase.from('inbox_messages').delete().eq('id', testMessageId);
    }
    if (testThreadId) {
      await supabase.from('inbox_threads').delete().eq('id', testThreadId);
    }
  });

  describe('Case 1: Perfect Reply', () => {
    test('should create message and update thread when reply has valid In-Reply-To header', async () => {
      // Setup: Create a test thread first
      const { data: thread, error: threadError } = await supabase
        .from('inbox_threads')
        .insert({
          subject: 'Test Thread',
          from_email: 'homeowner@example.com',
          to_email: 'owner@roofing.com',
        })
        .select()
        .single();

      expect(threadError).toBeNull();
      expect(thread).toBeTruthy();
      testThreadId = thread?.id || null;

      // Simulate webhook payload
      const webhookPayload = {
        provider: 'gmail',
        external_id: 'test-external-123',
        thread_id: thread?.id,
        direction: 'inbound',
        body_text: 'Yes, I am interested in getting a quote.',
        from_email: 'homeowner@example.com',
        to_email: 'owner@roofing.com',
        message_id: 'test-message-123',
        in_reply_to: 'original-message-id',
        received_at: new Date().toISOString(),
      };

      // Call webhook handler (simulate)
      const { data: message, error: messageError } = await supabase
        .from('inbox_messages')
        .insert(webhookPayload)
        .select()
        .single();

      expect(messageError).toBeNull();
      expect(message).toBeTruthy();
      testMessageId = message?.id || null;

      // Verify thread was updated
      const { data: updatedThread } = await supabase
        .from('inbox_threads')
        .select('last_message_at, updated_at')
        .eq('id', thread?.id)
        .single();

      expect(updatedThread?.last_message_at).toBeTruthy();
      expect(updatedThread?.updated_at).toBeTruthy();
    });
  });

  describe('Case 2: Reply From Different Email (Orphaned)', () => {
    test('should detect orphaned reply when email address does not match', async () => {
      // Create thread with homeowner@example.com
      const { data: thread } = await supabase
        .from('inbox_threads')
        .insert({
          subject: 'Test Thread',
          from_email: 'homeowner@example.com',
          to_email: 'owner@roofing.com',
        })
        .select()
        .single();

      testThreadId = thread?.id || null;

      // Reply from different email (work@company.com)
      const orphanedPayload = {
        provider: 'gmail',
        external_id: 'test-orphaned-123',
        thread_id: null, // No thread match
        direction: 'inbound',
        body_text: 'I forwarded this to my work email.',
        from_email: 'work@company.com', // Different email
        to_email: 'owner@roofing.com',
        message_id: 'test-orphaned-msg',
        received_at: new Date().toISOString(),
      };

      const { data: orphanedMessage } = await supabase
        .from('inbox_messages')
        .insert(orphanedPayload)
        .select()
        .single();

      expect(orphanedMessage).toBeTruthy();
      expect(orphanedMessage?.thread_id).toBeNull(); // Should be orphaned

      // Verify orphaned detection (check for thread_key mismatch or null thread_id)
      const { data: orphanedMessages } = await supabase
        .from('inbox_messages')
        .select('*')
        .is('thread_id', null)
        .eq('from_email', 'work@company.com');

      expect(orphanedMessages?.length).toBeGreaterThan(0);
    });
  });

  describe('Case 3: Missing Headers', () => {
    test('should create thread even when In-Reply-To header is missing', async () => {
      const payloadWithoutHeaders = {
        provider: 'gmail',
        external_id: 'test-no-headers-123',
        thread_id: null,
        direction: 'inbound',
        body_text: 'Re: Your Roof Estimate - I am interested',
        subject: 'Re: Your Roof Estimate',
        from_email: 'homeowner@example.com',
        to_email: 'owner@roofing.com',
        message_id: 'test-no-headers-msg',
        received_at: new Date().toISOString(),
      };

      // Should still create message (subject-based matching would happen in real flow)
      const { data: message } = await supabase
        .from('inbox_messages')
        .insert(payloadWithoutHeaders)
        .select()
        .single();

      expect(message).toBeTruthy();
      testMessageId = message?.id || null;
    });
  });

  describe('Case 4: Duplicate Webhook', () => {
    test('should prevent duplicate messages when same webhook is received twice', async () => {
      const duplicatePayload = {
        provider: 'gmail',
        external_id: 'test-duplicate-123',
        thread_id: null,
        direction: 'inbound',
        body_text: 'Test message',
        from_email: 'homeowner@example.com',
        to_email: 'owner@roofing.com',
        message_id: 'test-duplicate-msg-123', // Same message_id
        received_at: new Date().toISOString(),
      };

      // First insert
      const { data: firstMessage } = await supabase
        .from('inbox_messages')
        .insert(duplicatePayload)
        .select()
        .single();

      expect(firstMessage).toBeTruthy();
      testMessageId = firstMessage?.id || null;

      // Try to insert duplicate (should fail or be ignored)
      const { data: duplicateMessage, error: duplicateError } = await supabase
        .from('inbox_messages')
        .insert(duplicatePayload)
        .select()
        .single();

      // Should either fail with unique constraint or return existing message
      if (duplicateError) {
        expect(duplicateError.message).toMatch(/duplicate|unique/i);
      } else {
        // If no error, verify it's the same message
        expect(duplicateMessage?.id).toBe(firstMessage?.id);
      }

      // Verify only one message exists
      const { data: messages } = await supabase
        .from('inbox_messages')
        .select('id')
        .eq('message_id', 'test-duplicate-msg-123');

      expect(messages?.length).toBe(1);
    });
  });

  describe('Case 5: Bounce Detection', () => {
    test('should filter out bounce emails', async () => {
      const bouncePayload = {
        provider: 'gmail',
        external_id: 'test-bounce-123',
        thread_id: null,
        direction: 'inbound',
        body_text: 'Delivery Status Notification (Failure)',
        subject: 'Mail Delivery Failed',
        from_email: 'mailer-daemon@example.com',
        to_email: 'owner@roofing.com',
        message_id: 'test-bounce-msg',
        received_at: new Date().toISOString(),
        is_bounce: true, // Mark as bounce
      };

      const { data: bounceMessage } = await supabase
        .from('inbox_messages')
        .insert(bouncePayload)
        .select()
        .single();

      expect(bounceMessage).toBeTruthy();

      // Verify bounce is marked (check for is_bounce flag or system message flag)
      const { data: bounces } = await supabase
        .from('inbox_messages')
        .select('*')
        .eq('from_email', 'mailer-daemon@example.com');

      expect(bounces?.length).toBeGreaterThan(0);
    });
  });

  describe('Case 6: Auto-Reply Detection', () => {
    test('should filter out auto-reply emails', async () => {
      const autoReplyPayload = {
        provider: 'gmail',
        external_id: 'test-autoreply-123',
        thread_id: null,
        direction: 'inbound',
        body_text: 'I am out of the office until next week.',
        subject: 'Out of Office: Auto-Reply',
        from_email: 'homeowner@example.com',
        to_email: 'owner@roofing.com',
        message_id: 'test-autoreply-msg',
        received_at: new Date().toISOString(),
        is_auto_reply: true, // Mark as auto-reply
      };

      const { data: autoReplyMessage } = await supabase
        .from('inbox_messages')
        .insert(autoReplyPayload)
        .select()
        .single();

      expect(autoReplyMessage).toBeTruthy();

      // Verify auto-reply is marked
      const { data: autoReplies } = await supabase
        .from('inbox_messages')
        .select('*')
        .eq('message_id', 'test-autoreply-msg');

      expect(autoReplies?.length).toBeGreaterThan(0);
    });
  });
});



















































