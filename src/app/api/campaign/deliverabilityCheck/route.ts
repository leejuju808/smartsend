import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

/**
 * POST /api/campaign/deliverabilityCheck
 * 
 * Checks email content for deliverability issues:
 * - Spam triggers
 * - Long paragraphs
 * - Too many links
 * - Overused words
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { html, text } = body;

    if (!html && !text) {
      return NextResponse.json(
        { error: 'html or text is required' },
        { status: 400 }
      );
    }

    const issues: string[] = [];
    const suggestions: string[] = [];

    const content = html || text || '';

    // Check for spam triggers
    const spamTriggers = [
      { pattern: /\b(click here|buy now|limited time|act now|urgent|free money)\b/gi, name: 'Spam trigger words' },
      { pattern: /\b(!!!|$$$|ALL CAPS)\b/g, name: 'Excessive punctuation/caps' },
      { pattern: /<a[^>]*href[^>]*>.*?<\/a>/gi, name: 'Links' },
    ];

    spamTriggers.forEach(({ pattern, name }) => {
      const matches = content.match(pattern);
      if (matches && matches.length > 2) {
        issues.push(`${name} found (${matches.length} instances)`);
        suggestions.push(`Reduce use of ${name.toLowerCase()}`);
      }
    });

    // Check for long paragraphs
    const longParagraphRegex = /<p>([^<]{300,})<\/p>/gi;
    if (longParagraphRegex.test(content)) {
      issues.push('Long paragraphs detected');
      suggestions.push('Split paragraphs into shorter chunks (3-4 sentences max)');
    }

    // Check link count
    const linkCount = (content.match(/<a\s+href/gi) || []).length;
    if (linkCount > 3) {
      issues.push(`Too many links (${linkCount} found)`);
      suggestions.push('Reduce to 1-2 links maximum');
    }

    // Check for overused words
    const overusedWords = ['amazing', 'incredible', 'guaranteed', 'free', 'click'];
    overusedWords.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = content.match(regex);
      if (matches && matches.length > 2) {
        issues.push(`Overused word: "${word}" (${matches.length} times)`);
        suggestions.push(`Replace "${word}" with alternatives`);
      }
    });

    // Check for missing unsubscribe link
    if (!content.includes('unsubscribe') && !content.includes('opt-out')) {
      issues.push('Missing unsubscribe link');
      suggestions.push('Add unsubscribe link for compliance');
    }

    return NextResponse.json({
      issues,
      suggestions,
      score: Math.max(0, 100 - (issues.length * 10)), // Simple scoring
      passed: issues.length === 0,
    });
  } catch (error: any) {
    console.error('Deliverability check error:', error);
    return NextResponse.json(
      { error: error.message || 'Deliverability check failed' },
      { status: 500 }
    );
  }
}





















































