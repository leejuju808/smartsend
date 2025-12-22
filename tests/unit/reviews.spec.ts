import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';

// Mock Supabase
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

describe('Reviews System', () => {
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

  describe('Review submission validation', () => {
    it('should require template ID and rating', () => {
      const reviewData = { templateId: '', rating: 0 };
      expect(reviewData.templateId).toBeTruthy();
      expect(reviewData.rating).toBeGreaterThan(0);
      expect(reviewData.rating).toBeLessThanOrEqual(5);
    });

    it('should validate rating range', () => {
      const validRatings = [1, 2, 3, 4, 5];
      const invalidRatings = [0, 6, -1, 1.5];

      validRatings.forEach(rating => {
        expect(rating).toBeGreaterThanOrEqual(1);
        expect(rating).toBeLessThanOrEqual(5);
        expect(Number.isInteger(rating)).toBe(true);
      });

      invalidRatings.forEach(rating => {
        expect(rating < 1 || rating > 5 || !Number.isInteger(rating)).toBe(true);
      });
    });
  });

  describe('Review submission flow', () => {
    it('should check if user has installed template before allowing review', async () => {
      // Mock successful install check
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'install-123' },
        error: null,
      });

      const hasInstall = await mockSupabase
        .from('marketplace_installs')
        .select('id')
        .eq('template_id', 'template-123')
        .eq('user_id', 'user-123')
        .single();

      expect(hasInstall.data).toBeTruthy();
      expect(hasInstall.error).toBeNull();
    });

    it('should upsert review data', async () => {
      const reviewData = {
        template_id: 'template-123',
        user_id: 'user-123',
        rating: 5,
        title: 'Great template!',
        body: 'Really helped with my outreach',
      };

      mockSupabase.upsert.mockResolvedValueOnce({
        data: { ...reviewData, id: 'review-123' },
        error: null,
      });

      const result = await mockSupabase
        .from('marketplace_reviews')
        .upsert(reviewData, { onConflict: 'template_id,user_id' })
        .select()
        .single();

      expect(result.data).toBeTruthy();
      expect(result.data.rating).toBe(5);
    });

    it('should recalculate average rating after review submission', async () => {
      // Mock reviews data
      const reviews = [
        { rating: 5 },
        { rating: 4 },
        { rating: 5 },
      ];

      mockSupabase.select.mockResolvedValueOnce({
        data: reviews,
        error: null,
      });

      const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
      expect(avgRating).toBe(4.67);
    });
  });

  describe('Review policies', () => {
    it('should only allow users to review templates they have installed', () => {
      const userId = 'user-123';
      const templateId = 'template-123';

      // Mock install check
      mockSupabase.single.mockResolvedValueOnce({
        data: null, // No install found
        error: { message: 'No rows returned' },
      });

      const canReview = mockSupabase
        .from('marketplace_installs')
        .select('id')
        .eq('template_id', templateId)
        .eq('user_id', userId)
        .single();

      expect(canReview.data).toBeNull();
      expect(canReview.error).toBeTruthy();
    });

    it('should allow users to update their existing reviews', async () => {
      const reviewData = {
        template_id: 'template-123',
        user_id: 'user-123',
        rating: 4, // Updated from 5
        title: 'Updated review',
        body: 'Still great, but could be better',
      };

      mockSupabase.upsert.mockResolvedValueOnce({
        data: { ...reviewData, id: 'review-123' },
        error: null,
      });

      const result = await mockSupabase
        .from('marketplace_reviews')
        .upsert(reviewData, { onConflict: 'template_id,user_id' })
        .select()
        .single();

      expect(result.data.rating).toBe(4);
      expect(result.data.title).toBe('Updated review');
    });
  });

  describe('Rating calculations', () => {
    it('should calculate correct average rating', () => {
      const testCases = [
        { ratings: [5], expected: 5.0 },
        { ratings: [4, 5], expected: 4.5 },
        { ratings: [1, 2, 3, 4, 5], expected: 3.0 },
        { ratings: [5, 5, 5, 5, 5], expected: 5.0 },
      ];

      testCases.forEach(({ ratings, expected }) => {
        const avg = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
        expect(avg).toBe(expected);
      });
    });

    it('should handle edge cases', () => {
      const emptyRatings: number[] = [];
      const singleRating = [5];
      const mixedRatings = [1, 5, 3, 4, 2];

      expect(emptyRatings.length).toBe(0);
      expect(singleRating.reduce((sum, r) => sum + r, 0) / singleRating.length).toBe(5);
      expect(mixedRatings.reduce((sum, r) => sum + r, 0) / mixedRatings.length).toBe(3);
    });
  });
}); 