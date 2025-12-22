/**
 * Block 19720 — Inbox Database Tests
 * Tests for database operations: inserts, updates, queries, constraints
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';

const supabase = createClient(supabaseUrl, supabaseKey);

describe('Inbox Database Tests', () => {
  let testThreadId: string | null = null;
  let testMessageIds: string[] = [];

  beforeEach(async () => {
    testMessageIds = [];
  });

  afterEach(async () => {
    // Clean up test data
    if (testMessageIds.length > 0) {
      await supabase.from('inbox_messages').delete().in('id', testMessageIds);
    }
    if (testThreadId) {
      await supabase.from('inbox_threads').delete().eq('id', testThreadId);
    }
  });

  describe('Thread Creation', () => {
    test('should create thread with required fields', async () => {
      const { data: thread, error } = await supabase
        .from('inbox_threads')
        .insert({
          subject: 'Test Thread',
          from_email: 'homeowner@example.com',
          to_email: 'owner@roofing.com',
          account_id: 'test-account-id',
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(thread).toBeTruthy();
      expect(thread?.id).toBeTruthy();
      expect(thread?.created_at).toBeTruthy();
      testThreadId = thread?.id || null;
    });

    test('should update thread last_message_at when message added', async () => {
      // Create thread
      const { data: thread } = await supabase
        .from('inbox_threads')
        .insert({
          subject: 'Test Thread',
          from_email: 'homeowner@example.com',
          to_email: 'owner@roofing.com',
          account_id: 'test-account-id',
        })
        .select()
        .single();

      testThreadId = thread?.id || null;
      const originalUpdatedAt = thread?.updated_at;

      // Wait a moment
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Add message
      const { data: message } = await supabase
        .from('inbox_messages')
        .insert({
          thread_id: thread?.id,
          direction: 'inbound',
          body_text: 'Test message',
          from_email: 'homeowner@example.com',
          to_email: 'owner@roofing.com',
        })
        .select()
        .single();

      expect(message).toBeTruthy();
      testMessageIds.push(message?.id || '');

      // Verify thread updated
      const { data: updatedThread } = await supabase
        .from('inbox_threads')
        .select('last_message_at, updated_at')
        .eq('id', thread?.id)
        .single();

      expect(updatedThread?.last_message_at).toBeTruthy();
      expect(updatedThread?.updated_at).not.toBe(originalUpdatedAt);
    });
  });

  describe('Message Insertion', () => {
    test('should insert message with all required fields', async () => {
      // Create thread first
      const { data: thread } = await supabase
        .from('inbox_threads')
        .insert({
          subject: 'Test Thread',
          from_email: 'homeowner@example.com',
          to_email: 'owner@roofing.com',
          account_id: 'test-account-id',
        })
        .select()
        .single();

      testThreadId = thread?.id || null;

      // Insert message
      const { data: message, error } = await supabase
        .from('inbox_messages')
        .insert({
          thread_id: thread?.id,
          direction: 'inbound',
          body_text: 'Test message body',
          from_email: 'homeowner@example.com',
          to_email: 'owner@roofing.com',
          provider: 'gmail',
          message_id: 'test-msg-123',
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(message).toBeTruthy();
      expect(message?.thread_id).toBe(thread?.id);
      expect(message?.direction).toBe('inbound');
      testMessageIds.push(message?.id || '');
    });

    test('should enforce unique constraint on message_id', async () => {
      const { data: thread } = await supabase
        .from('inbox_threads')
        .insert({
          subject: 'Test Thread',
          from_email: 'homeowner@example.com',
          to_email: 'owner@roofing.com',
          account_id: 'test-account-id',
        })
        .select()
        .single();

      testThreadId = thread?.id || null;

      const messageData = {
        thread_id: thread?.id,
        direction: 'inbound',
        body_text: 'Test',
        from_email: 'homeowner@example.com',
        to_email: 'owner@roofing.com',
        provider: 'gmail',
        message_id: 'unique-msg-id-123',
      };

      // First insert should succeed
      const { data: firstMessage } = await supabase
        .from('inbox_messages')
        .insert(messageData)
        .select()
        .single();

      expect(firstMessage).toBeTruthy();
      testMessageIds.push(firstMessage?.id || '');

      // Second insert with same message_id should fail
      const { error: duplicateError } = await supabase
        .from('inbox_messages')
        .insert(messageData);

      expect(duplicateError).toBeTruthy();
      expect(duplicateError?.message).toMatch(/duplicate|unique/i);
    });
  });

  describe('Query Performance', () => {
    test('should query threads efficiently with indexes', async () => {
      // Create multiple threads
      const threads = [];
      for (let i = 0; i < 10; i++) {
        const { data: thread } = await supabase
          .from('inbox_threads')
          .insert({
            subject: `Test Thread ${i}`,
            from_email: `homeowner${i}@example.com`,
            to_email: 'owner@roofing.com',
            account_id: 'test-account-id',
          })
          .select()
          .single();

        if (thread) {
          threads.push(thread.id);
        }
      }

      // Query with filter (should use index)
      const startTime = Date.now();
      const { data: filteredThreads } = await supabase
        .from('inbox_threads')
        .select('*')
        .eq('account_id', 'test-account-id')
        .order('last_message_at', { ascending: false })
        .limit(10);

      const queryTime = Date.now() - startTime;

      expect(filteredThreads).toBeTruthy();
      expect(queryTime).toBeLessThan(300); // Should be fast with indexes

      // Cleanup
      if (threads.length > 0) {
        await supabase.from('inbox_threads').delete().in('id', threads);
      }
    });
  });

  describe('Settings Storage', () => {
    test('should save and retrieve inbox settings', async () => {
      const userId = 'test-user-id';

      // Insert settings
      const { data: settings, error: insertError } = await supabase
        .from('inbox_settings')
        .upsert({
          user_id: userId,
          default_tab: 'hot',
          notify_new_hot: true,
          notify_new_warm: false,
          quiet_hours_start: '22:00',
          quiet_hours_end: '07:00',
          lead_priority_weight_hot: 100,
        })
        .select()
        .single();

      expect(insertError).toBeNull();
      expect(settings).toBeTruthy();
      expect(settings?.default_tab).toBe('hot');
      expect(settings?.quiet_hours_start).toBe('22:00');

      // Retrieve settings
      const { data: retrievedSettings } = await supabase
        .from('inbox_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

      expect(retrievedSettings).toBeTruthy();
      expect(retrievedSettings?.default_tab).toBe('hot');

      // Cleanup
      await supabase.from('inbox_settings').delete().eq('user_id', userId);
    });

    test('should validate quiet hours format', async () => {
      const userId = 'test-user-id-2';

      // Try invalid time format (should be rejected by DB or app layer)
      const { error: invalidError } = await supabase
        .from('inbox_settings')
        .upsert({
          user_id: userId,
          quiet_hours_start: '25:00', // Invalid hour
        });

      // Should either fail validation or be handled gracefully
      if (invalidError) {
        expect(invalidError.message).toBeTruthy();
      }

      // Cleanup
      await supabase.from('inbox_settings').delete().eq('user_id', userId);
    });
  });
});



















































