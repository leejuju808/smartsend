/**
 * Block 19720 — Inbox AI Classification Tests
 * Tests for AI intent classification, lead scoring, and tag extraction
 */

import { describe, test, expect } from '@jest/globals';
import { classifyLeadIntent } from '@/lib/ai/classifyLeadIntent';

describe('Inbox AI Classification Tests', () => {
  describe('Hot Intent Classification', () => {
    test('should classify storm damage as HOT', async () => {
      const result = await classifyLeadIntent(
        'My roof was damaged in the storm last week. I need someone to come out and look at it ASAP.',
        'Roof Damage from Storm'
      );

      expect(result.classification).toBe('HOT');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    test('should classify active leak as HOT', async () => {
      const result = await classifyLeadIntent(
        'Water is coming through my ceiling right now. This is urgent!',
        'URGENT: Leak in Ceiling'
      );

      expect(result.classification).toBe('HOT');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('should classify insurance claim as HOT', async () => {
      const result = await classifyLeadIntent(
        'I filed an insurance claim for roof damage. When can you come out to inspect?',
        'Insurance Claim - Need Inspection'
      );

      expect(result.classification).toBe('HOT');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    test('should classify inspection request as HOT', async () => {
      const result = await classifyLeadIntent(
        'Can someone come out to look at my roof? I think there might be damage.',
        'Roof Inspection Request'
      );

      expect(result.classification).toBe('HOT');
      expect(result.confidence).toBeGreaterThan(0.6);
    });
  });

  describe('Warm Intent Classification', () => {
    test('should classify price shopping as WARM', async () => {
      const result = await classifyLeadIntent(
        'What would a new roof cost? I am considering replacing mine.',
        'Roof Replacement Cost'
      );

      expect(result.classification).toBe('WARM');
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    test('should classify "what\'s the price?" as WARM', async () => {
      const result = await classifyLeadIntent(
        'How much does this cost?',
        'Pricing Question'
      );

      expect(result.classification).toBe('WARM');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    test('should classify ghosting follow-up as WARM', async () => {
      const result = await classifyLeadIntent(
        'Sorry for the delay, I am still interested in getting a quote.',
        'Follow-up: Still Interested'
      );

      expect(result.classification).toBe('WARM');
      expect(result.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('Not Interested Classification', () => {
    test('should classify "not interested" as NOT_INTERESTED', async () => {
      const result = await classifyLeadIntent(
        'We are not interested at this time. Please remove us from your list.',
        'Not Interested'
      );

      expect(result.classification).toBe('NOT_INTERESTED');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('should classify unsubscribe request as NOT_INTERESTED', async () => {
      const result = await classifyLeadIntent(
        'Please remove me from your email list. Not interested.',
        'Unsubscribe Request'
      );

      expect(result.classification).toBe('NOT_INTERESTED');
      expect(result.confidence).toBeGreaterThan(0.8);
    });
  });

  describe('Follow-Up Classification', () => {
    test('should classify partial info as FOLLOW_UP', async () => {
      const result = await classifyLeadIntent(
        'Hi, I saw your email about roofing.',
        'Re: Roofing Services'
      );

      expect(result.classification).toBe('FOLLOW_UP');
      expect(result.confidence).toBeGreaterThan(0.4);
    });

    test('should classify confusing messages as FOLLOW_UP', async () => {
      const result = await classifyLeadIntent(
        'Maybe, not sure, let me think about it.',
        'Considering Options'
      );

      expect(result.classification).toBe('FOLLOW_UP');
      expect(result.confidence).toBeGreaterThan(0.4);
    });
  });

  describe('Multi-Paragraph Emails', () => {
    test('should handle long emails with multiple topics', async () => {
      const longEmail = `
        Hi there,
        
        I received your email about roofing services. We had a big storm last month
        and I noticed some shingles missing. I also have a leak in my attic that
        started after the storm.
        
        I am wondering what the cost would be to fix these issues. I have insurance
        coverage, so I would like to know if you work with insurance companies.
        
        Also, how soon could someone come out to take a look? This is getting worse
        with each rain.
        
        Thanks,
        Homeowner
      `;

      const result = await classifyLeadIntent(longEmail, 'Roof Damage Inquiry');

      // Should classify as HOT due to leak + urgency
      expect(result.classification).toBe('HOT');
      expect(result.confidence).toBeGreaterThan(0.6);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty message', async () => {
      const result = await classifyLeadIntent('', '');

      expect(result.classification).toBe('FOLLOW_UP');
      expect(result.confidence).toBeLessThan(0.6);
    });

    test('should handle very short message', async () => {
      const result = await classifyLeadIntent('Yes', 'Re: Quote');

      // Should default to FOLLOW_UP or attempt classification
      expect(['HOT', 'WARM', 'FOLLOW_UP']).toContain(result.classification);
    });

    test('should handle special characters', async () => {
      const result = await classifyLeadIntent(
        'I need a quote ASAP!!! $$$',
        'Urgent Quote Request'
      );

      expect(result.classification).toBe('HOT');
    });
  });

  describe('Confidence Scores', () => {
    test('should return confidence score between 0 and 1', async () => {
      const result = await classifyLeadIntent(
        'I need a roof inspection urgently.',
        'Urgent Inspection'
      );

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    test('should provide reasoning for classification', async () => {
      const result = await classifyLeadIntent(
        'My roof is leaking and I need help now!',
        'URGENT: Leak'
      );

      expect(result.reasoning).toBeTruthy();
      expect(typeof result.reasoning).toBe('string');
    });
  });
});



















































