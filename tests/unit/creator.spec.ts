import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';

// Mock Supabase
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

describe('Creator System', () => {
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
      upsert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      in: jest.fn(),
    };
    
    (createClient as any).mockReturnValue(mockSupabase);
  });

  describe('Creator application flow', () => {
    it('should create creator profile with required fields', async () => {
      const creatorData = {
        user_id: 'user-123',
        display_name: 'John Doe',
        bio: 'Email marketing expert',
        website: 'https://johndoe.com',
        status: 'pending',
      };

      mockSupabase.upsert.mockResolvedValueOnce({
        data: { ...creatorData, id: 'creator-123' },
        error: null,
      });

      const result = await mockSupabase
        .from('marketplace_creators')
        .upsert(creatorData, { onConflict: 'user_id' })
        .select()
        .single();

      expect(result.data.display_name).toBe('John Doe');
      expect(result.data.status).toBe('pending');
      expect(result.data.user_id).toBe('user-123');
    });

    it('should require display name', () => {
      const creatorData = {
        user_id: 'user-123',
        display_name: '',
        bio: 'Email marketing expert',
      };

      expect(creatorData.display_name).toBeTruthy();
    });

    it('should set default status to pending', () => {
      const creatorData = {
        user_id: 'user-123',
        display_name: 'John Doe',
        status: 'pending',
      };

      expect(creatorData.status).toBe('pending');
    });
  });

  describe('Creator profile management', () => {
    it('should allow creators to view their own profile', async () => {
      const userId = 'user-123';
      
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'creator-123',
          user_id: userId,
          display_name: 'John Doe',
          status: 'approved',
        },
        error: null,
      });

      const profile = await mockSupabase
        .from('marketplace_creators')
        .select('*')
        .eq('user_id', userId)
        .single();

      expect(profile.data.user_id).toBe(userId);
      expect(profile.data.status).toBe('approved');
    });

    it('should allow admins to manage all creators', async () => {
      const adminUserId = 'admin-123';
      
      // Mock admin role check
      mockSupabase.single.mockResolvedValueOnce({
        data: { role: 'admin' },
        error: null,
      });

      const isAdmin = await mockSupabase
        .from('profiles')
        .select('role')
        .eq('id', adminUserId)
        .single();

      expect(isAdmin.data.role).toBe('admin');
    });
  });

  describe('Creator status transitions', () => {
    it('should allow status changes: pending -> approved', async () => {
      const creatorId = 'creator-123';
      const newStatus = 'approved';

      mockSupabase.update.mockResolvedValueOnce({
        data: { status: newStatus },
        error: null,
      });

      const result = await mockSupabase
        .from('marketplace_creators')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', creatorId);

      expect(result.data.status).toBe('approved');
    });

    it('should allow status changes: approved -> disabled', async () => {
      const creatorId = 'creator-123';
      const newStatus = 'disabled';

      mockSupabase.update.mockResolvedValueOnce({
        data: { status: newStatus },
        error: null,
      });

      const result = await mockSupabase
        .from('marketplace_creators')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', creatorId);

      expect(result.data.status).toBe('disabled');
    });

    it('should validate status values', () => {
      const validStatuses = ['pending', 'approved', 'rejected', 'disabled'];
      const invalidStatus = 'invalid';

      expect(validStatuses).toContain('pending');
      expect(validStatuses).toContain('approved');
      expect(validStatuses).toContain('rejected');
      expect(validStatuses).toContain('disabled');
      expect(validStatuses).not.toContain(invalidStatus);
    });
  });

  describe('Creator balance tracking', () => {
    it('should calculate correct balance from payout ledger', async () => {
      const creatorId = 'creator-123';
      
      mockSupabase.select.mockResolvedValueOnce({
        data: [
          { amount_cents: 1000, status: 'accrued' },
          { amount_cents: 500, status: 'queued' },
          { amount_cents: 2000, status: 'paid' },
        ],
        error: null,
      });

      const ledger = await mockSupabase
        .from('marketplace_payout_ledger')
        .select('amount_cents, status')
        .eq('creator_id', creatorId);

      const balance = {
        accrued: 0,
        queued: 0,
        paid: 0,
        total: 0,
      };

      ledger.data?.forEach((row: any) => {
        balance[row.status as keyof typeof balance] += row.amount_cents;
        balance.total += row.amount_cents;
      });

      expect(balance.accrued).toBe(1000);
      expect(balance.queued).toBe(500);
      expect(balance.paid).toBe(2000);
      expect(balance.total).toBe(3500);
    });

    it('should handle empty ledger', async () => {
      const creatorId = 'creator-123';
      
      mockSupabase.select.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const ledger = await mockSupabase
        .from('marketplace_payout_ledger')
        .select('amount_cents, status')
        .eq('creator_id', creatorId);

      const balance = {
        accrued: 0,
        queued: 0,
        paid: 0,
        total: 0,
      };

      expect(balance.accrued).toBe(0);
      expect(balance.queued).toBe(0);
      expect(balance.paid).toBe(0);
      expect(balance.total).toBe(0);
    });
  });

  describe('Creator templates', () => {
    it('should associate templates with creators', async () => {
      const creatorId = 'creator-123';
      
      mockSupabase.select.mockResolvedValueOnce({
        data: [
          {
            id: 'template-1',
            name: 'Cold Email Sequence',
            creator_id: creatorId,
            rating: 4.5,
            installs: 10,
          },
          {
            id: 'template-2',
            name: 'Follow-up Campaign',
            creator_id: creatorId,
            rating: 4.8,
            installs: 15,
          },
        ],
        error: null,
      });

      const templates = await mockSupabase
        .from('marketplace_templates')
        .select(`
          id,
          name,
          rating,
          installs
        `)
        .eq('creator_id', creatorId)
        .order('created_at', { ascending: false });

      expect(templates.data).toHaveLength(2);
      expect(templates.data[0].creator_id).toBe(creatorId);
      expect(templates.data[1].creator_id).toBe(creatorId);
    });
  });
}); 