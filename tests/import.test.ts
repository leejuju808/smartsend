import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createClient } from '@/lib/supabase/server';

describe('Import System', () => {
  let supabase: ReturnType<typeof createClient>;

  beforeAll(() => {
    supabase = createClient();
  });

  it('should have the required database tables', async () => {
    // Test that the contacts table exists
    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select('*')
      .limit(1);
    
    expect(contactsError).toBeNull();
    expect(Array.isArray(contacts)).toBe(true);

    // Test that the suppressions table exists
    const { data: suppressions, error: suppressionsError } = await supabase
      .from('suppressions')
      .select('*')
      .limit(1);
    
    expect(suppressionsError).toBeNull();
    expect(Array.isArray(suppressions)).toBe(true);

    // Test that the campaigns table exists
    const { data: campaigns, error: campaignsError } = await supabase
      .from('campaigns')
      .select('*')
      .limit(1);
    
    expect(campaignsError).toBeNull();
    expect(Array.isArray(campaigns)).toBe(true);

    // Test that the campaign_suppressions table exists
    const { data: campaignSuppressions, error: campaignSuppressionsError } = await supabase
      .from('campaign_suppressions')
      .select('*')
      .limit(1);
    
    expect(campaignSuppressionsError).toBeNull();
    expect(Array.isArray(campaignSuppressions)).toBe(true);
  });

  it('should have the is_suppressed function', async () => {
    // Test the helper function exists by calling it
    const { data, error } = await supabase.rpc('is_suppressed', {
      p_workspace: '00000000-0000-0000-0000-000000000000',
      p_email: 'test@example.com'
    });
    
    expect(error).toBeNull();
    expect(typeof data).toBe('boolean');
  });

  it('should validate email format correctly', () => {
    const validEmails = [
      'test@example.com',
      'user.name@domain.co.uk',
      'test+tag@example.org'
    ];

    const invalidEmails = [
      'invalid-email',
      '@example.com',
      'test@',
      'test.example.com'
    ];

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

    validEmails.forEach(email => {
      expect(emailRegex.test(email)).toBe(true);
    });

    invalidEmails.forEach(email => {
      expect(emailRegex.test(email)).toBe(false);
    });
  });
});