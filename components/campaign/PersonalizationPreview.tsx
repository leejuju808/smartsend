/**
 * Block 9400 — AI Personalization Engine v1
 * Before/After Personalization Preview Component
 */

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface PersonalizationPreviewProps {
  campaignId: string;
  templateSubject: string;
  templateBody: string;
  contactId?: string;
  onPersonalized?: (result: { subject: string; body: string }) => void;
}

export function PersonalizationPreview({
  campaignId,
  templateSubject,
  templateBody,
  contactId,
  onPersonalized,
}: PersonalizationPreviewProps) {
  const [loading, setLoading] = useState(false);
  const [before, setBefore] = useState<{ subject: string; body: string } | null>(null);
  const [after, setAfter] = useState<{ subject: string; body: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePreview = async () => {
    if (!contactId) {
      setError('Please select a contact to preview personalization');
      return;
    }

    setLoading(true);
    setError(null);
    setBefore({ subject: templateSubject, body: templateBody });

    try {
      const response = await fetch('/api/ai/personalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_subject: templateSubject,
          template_body: templateBody,
          contact_id: contactId,
          campaign_id: campaignId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to personalize');
      }

      const data = await response.json();
      setAfter({ subject: data.subject, body: data.body });
      
      if (onPersonalized) {
        onPersonalized({ subject: data.subject, body: data.body });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate preview');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">AI Personalization Preview</h3>
          <p className="text-xs text-muted-foreground mt-1">
            See how your email will be personalized for each contact
          </p>
        </div>
        <Button
          onClick={handlePreview}
          disabled={loading || !contactId}
          size="sm"
          variant="outline"
        >
          {loading ? 'Generating...' : 'Preview Personalization'}
        </Button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {before && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Before */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-muted-foreground">Before</h4>
              <span className="text-xs px-2 py-1 bg-gray-100 rounded">Template</span>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Subject</div>
              <div className="text-sm font-medium">{before.subject || '(empty)'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Body</div>
              <div className="text-sm whitespace-pre-wrap border rounded p-2 bg-gray-50">
                {before.body || '(empty)'}
              </div>
            </div>
          </div>

          {/* After */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">After</h4>
              <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded">
                Personalized
              </span>
            </div>
            {after ? (
              <>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Subject</div>
                  <div className="text-sm font-medium">{after.subject || '(empty)'}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Body</div>
                  <div className="text-sm whitespace-pre-wrap border rounded p-2 bg-green-50">
                    {after.body || '(empty)'}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground italic">
                Click &quot;Preview Personalization&quot; to see the personalized version
              </div>
            )}
          </div>
        </div>
      )}

      {!before && (
        <div className="border rounded-lg p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {contactId
              ? 'Click "Preview Personalization" to see how this email will be personalized'
              : 'Select a contact to preview personalization'}
          </p>
        </div>
      )}
    </div>
  );
}
























































