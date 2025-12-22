/**
 * Testing Stub for AI Reply Detection
 * 
 * Use this to simulate fake email payloads for local testing
 * 
 * Usage:
 * ```typescript
 * import { simulateReplyDetection } from '@/lib/reply-detection/test-stub'
 * 
 * // Test a genuine reply
 * await simulateReplyDetection({
 *   leadId: 'test-lead-123',
 *   emailSnippet: 'Hey, thanks for reaching out! I would love to learn more.'
 * })
 * 
 * // Test a non-reply (auto-reply/bounce)
 * await simulateReplyDetection({
 *   leadId: 'test-lead-456',
 *   emailSnippet: 'I am out of the office until next week.'
 * })
 * ```
 */

export interface ReplyDetectionTestPayload {
  leadId: string
  emailSnippet: string
}

export async function simulateReplyDetection(payload: ReplyDetectionTestPayload) {
  try {
    const response = await fetch('/api/reply-detection', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const result = await response.json()

    if (!response.ok) {
      console.error('❌ Reply detection failed:', result)
      return { success: false, error: result }
    }

    console.log('✅ Reply detection result:', result)
    return result
  } catch (error) {
    console.error('❌ Error calling reply detection:', error)
    throw error
  }
}

/**
 * Sample test cases you can use in your development environment
 */
export const SAMPLE_TEST_CASES: ReplyDetectionTestPayload[] = [
  {
    leadId: 'test-lead-1',
    emailSnippet: 'Hey, thanks for reaching out! I would love to schedule a call to discuss this further.',
  },
  {
    leadId: 'test-lead-2',
    emailSnippet: 'I am out of the office until January 15th. I will respond to your email upon my return.',
  },
  {
    leadId: 'test-lead-3',
    emailSnippet: 'This sounds interesting. Can you send me more information?',
  },
  {
    leadId: 'test-lead-4',
    emailSnippet: 'You are receiving this automatic reply because your message could not be delivered.',
  },
  {
    leadId: 'test-lead-5',
    emailSnippet: 'Thanks! This looks great. When can we get started?',
  },
]

