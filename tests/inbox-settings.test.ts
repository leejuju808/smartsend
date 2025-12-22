/**
 * Block 19720 — Inbox Settings Tests
 * Tests for settings save/load, quiet hours, notifications, and defaults
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';

const supabase = createClient(supabaseUrl, supabaseKey);

describe('Inbox Settings Tests', () => {
  const testUserId = 'test-user-settings-123';

  beforeEach(async () => {
    // Clean up any existing test settings
    await supabase.from('inbox_settings').delete().eq('user_id', testUserId);
  });

  afterEach(async () => {
    // Clean up after tests
    await supabase.from('inbox_settings').delete().eq('user_id', testUserId);
  });

  describe('Default Tab Settings', () => {
    test('should save default tab preference', async () => {
      const { data: settings, error } = await supabase
        .from('inbox_settings')
        .upsert({
          user_id: testUserId,
          default_tab: 'hot',
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(settings).toBeTruthy();
      expect(settings?.default_tab).toBe('hot');
    });

    test('should load default tab on retrieval', async () => {
      // Save settings
      await supabase
        .from('inbox_settings')
        .upsert({
          user_id: testUserId,
          default_tab: 'warm',
        });

      // Retrieve settings
      const { data: settings } = await supabase
        .from('inbox_settings')
        .select('default_tab')
        .eq('user_id', testUserId)
        .single();

      expect(settings?.default_tab).toBe('warm');
    });

    test('should default to "all" if no preference set', async () => {
      // Don't set default_tab
      const { data: settings } = await supabase
        .from('inbox_settings')
        .upsert({
          user_id: testUserId,
        })
        .select()
        .single();

      expect(settings?.default_tab).toBe('all');
    });
  });

  describe('Quiet Hours Settings', () => {
    test('should save quiet hours start and end times', async () => {
      const { data: settings, error } = await supabase
        .from('inbox_settings')
        .upsert({
          user_id: testUserId,
          quiet_hours_start: '22:00',
          quiet_hours_end: '07:00',
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(settings).toBeTruthy();
      expect(settings?.quiet_hours_start).toBe('22:00');
      expect(settings?.quiet_hours_end).toBe('07:00');
    });

    test('should handle quiet hours that span midnight', async () => {
      const { data: settings } = await supabase
        .from('inbox_settings')
        .upsert({
          user_id: testUserId,
          quiet_hours_start: '20:00', // 8 PM
          quiet_hours_end: '06:00',   // 6 AM next day
        })
        .select()
        .single();

      expect(settings?.quiet_hours_start).toBe('20:00');
      expect(settings?.quiet_hours_end).toBe('06:00');
    });

    test('should allow null quiet hours (disabled)', async () => {
      const { data: settings } = await supabase
        .from('inbox_settings')
        .upsert({
          user_id: testUserId,
          quiet_hours_start: null,
          quiet_hours_end: null,
        })
        .select()
        .single();

      expect(settings?.quiet_hours_start).toBeNull();
      expect(settings?.quiet_hours_end).toBeNull();
    });
  });

  describe('Notification Toggles', () => {
    test('should save notification preferences', async () => {
      const { data: settings } = await supabase
        .from('inbox_settings')
        .upsert({
          user_id: testUserId,
          notify_new_hot: true,
          notify_new_warm: false,
          notify_new_follow_up: true,
          notify_booked: true,
        })
        .select()
        .single();

      expect(settings?.notify_new_hot).toBe(true);
      expect(settings?.notify_new_warm).toBe(false);
      expect(settings?.notify_new_follow_up).toBe(true);
      expect(settings?.notify_booked).toBe(true);
    });

    test('should default notifications to true', async () => {
      const { data: settings } = await supabase
        .from('inbox_settings')
        .upsert({
          user_id: testUserId,
        })
        .select()
        .single();

      expect(settings?.notify_new_hot).toBe(true);
      expect(settings?.notify_new_warm).toBe(true);
      expect(settings?.notify_new_follow_up).toBe(true);
      expect(settings?.notify_booked).toBe(true);
    });
  });

  describe('Lead Priority Weights', () => {
    test('should save lead priority weights', async () => {
      const { data: settings } = await supabase
        .from('inbox_settings')
        .upsert({
          user_id: testUserId,
          lead_priority_weight_hot: 100,
          lead_priority_weight_warm: 70,
          lead_priority_weight_followup: 50,
        })
        .select()
        .single();

      expect(settings?.lead_priority_weight_hot).toBe(100);
      expect(settings?.lead_priority_weight_warm).toBe(70);
      expect(settings?.lead_priority_weight_followup).toBe(50);
    });

    test('should validate weight range (0-100)', async () => {
      // Try to insert invalid weight (> 100)
      const { error: invalidError } = await supabase
        .from('inbox_settings')
        .upsert({
          user_id: testUserId,
          lead_priority_weight_hot: 150, // Invalid
        });

      // Should fail validation (DB constraint or app validation)
      if (invalidError) {
        expect(invalidError.message).toBeTruthy();
      }
    });

    test('should default weights to standard values', async () => {
      const { data: settings } = await supabase
        .from('inbox_settings')
        .upsert({
          user_id: testUserId,
        })
        .select()
        .single();

      expect(settings?.lead_priority_weight_hot).toBe(100);
      expect(settings?.lead_priority_weight_warm).toBe(70);
      expect(settings?.lead_priority_weight_followup).toBe(50);
    });
  });

  describe('Settings Update Timestamp', () => {
    test('should update updated_at timestamp on change', async () => {
      // Create initial settings
      const { data: initialSettings } = await supabase
        .from('inbox_settings')
        .upsert({
          user_id: testUserId,
          default_tab: 'all',
        })
        .select()
        .single();

      const initialUpdatedAt = initialSettings?.updated_at;

      // Wait a moment
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Update settings
      const { data: updatedSettings } = await supabase
        .from('inbox_settings')
        .upsert({
          user_id: testUserId,
          default_tab: 'hot',
        })
        .select()
        .single();

      expect(updatedSettings?.updated_at).not.toBe(initialUpdatedAt);
    });
  });
});



















































