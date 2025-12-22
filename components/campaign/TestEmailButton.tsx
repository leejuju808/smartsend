/**
 * Block 9400 — AI Personalization Engine v1
 * "Send Test Email to Myself" Button Component
 */

'use client';

import { useState } from 'react';
import { Button } from '@/src/components/ui/Button';

interface TestEmailButtonProps {
  campaignId: string;
  templateSubject: string;
  templateBody: string;
  contactId?: string;
}

export function TestEmailButton({
  campaignId,
  templateSubject,
  templateBody,
  contactId,
}: TestEmailButtonProps) {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendTest = async () => {
    if (!contactId) {
      setError('Please select a contact to send test email');
      return;
    }

    setLoading(true);
    setError(null);
    setSent(false);

    try {
      // First, personalize the email
      const personalizeResponse = await fetch('/api/ai/personalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_subject: templateSubject,
          template_body: templateBody,
          contact_id: contactId,
          campaign_id: campaignId,
        }),
      });

      if (!personalizeResponse.ok) {
        const data = await personalizeResponse.json();
        throw new Error(data.error || 'Failed to personalize email');
      }

      const personalized = await personalizeResponse.json();

      // Then send the test email (you'll need to implement this endpoint)
      const sendResponse = await fetch('/api/campaigns/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: campaignId,
          contact_id: contactId,
          subject: personalized.subject,
          body: personalized.body,
        }),
      });

      if (!sendResponse.ok) {
        const data = await sendResponse.json();
        throw new Error(data.error || 'Failed to send test email');
      }

      setSent(true);
      setTimeout(() => setSent(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to send test email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        onClick={handleSendTest}
        disabled={loading || !contactId || sent}
        size="sm"
        variant="outline"
      >
        {loading
          ? 'Sending...'
          : sent
            ? '✓ Test Email Sent!'
            : 'Send Test Email to Myself'}
      </Button>

      {error && (
        <div className="text-xs text-red-600">{error}</div>
      )}

      {sent && (
        <div className="text-xs text-green-600">
          Test email sent! Check your inbox.
        </div>
      )}
    </div>
  );
}

