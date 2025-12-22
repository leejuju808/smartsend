'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/supabase-js';
import { Button } from '@/components/ui/Button';
import { X, Smile } from 'lucide-react';

export default function NpsWidget() {
  const supabase = createClientComponentClient();
  const [showWidget, setShowWidget] = useState(false);
  const [selectedScore, setSelectedScore] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get org_id from user's first org membership
      const { data: membership } = await supabase
        .from('org_members')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (!membership) return;

      setOrgId(membership.org_id);

      // Check if should show NPS
      const res = await fetch(`/api/nps?org_id=${membership.org_id}`);
      const data = await res.json();

      if (data.should_show) {
        setShowWidget(true);
      }
    }

    load();
  }, [supabase]);

  async function handleSubmit() {
    if (!orgId || selectedScore === null) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/nps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          score: selectedScore,
          feedback: feedback || null,
        }),
      });

      if (res.ok) {
        setShowWidget(false);
        // Show thank you message or close
      }
    } catch (error) {
      console.error('Error submitting NPS:', error);
    } finally {
      setSubmitting(false);
    }
  }

  if (!showWidget) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-5">
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-6 max-w-md">
        <button
          onClick={() => setShowWidget(false)}
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-start gap-3 mb-4">
          <div className="bg-blue-50 p-2 rounded-full">
            <Smile className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">How likely are you to recommend SmartSend?</h3>
            <p className="text-sm text-gray-600 mt-1">Your feedback helps us improve</p>
          </div>
        </div>

        {/* Score selector */}
        <div className="mb-4">
          <div className="flex items-center justify-between gap-1">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
              <button
                key={score}
                onClick={() => setSelectedScore(score)}
                className={`
                  flex-1 py-2 rounded text-sm font-medium transition-all
                  ${selectedScore === score
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }
                `}
              >
                {score}
              </button>
            ))}
          </div>
          <div className="flex justify-between mt-1 text-xs text-gray-500">
            <span>Not likely</span>
            <span>Very likely</span>
          </div>
        </div>

        {/* Optional feedback */}
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="What could we improve? (optional)"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-4 resize-none"
          rows={3}
        />

        {/* Submit button */}
        <Button
          onClick={handleSubmit}
          disabled={submitting || selectedScore === null}
          className="w-full bg-black text-white hover:bg-gray-800"
        >
          {submitting ? 'Submitting...' : 'Submit Feedback'}
        </Button>
      </div>
    </div>
  );
}

