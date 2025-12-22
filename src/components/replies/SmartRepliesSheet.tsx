'use client';

import * as React from 'react';
import { Button } from '@/components/ui/Button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/supabase/client';
import type { ReplyRow } from './RepliesList';

interface SmartRepliesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: ReplyRow;
}

export function SmartRepliesSheet({ open, onOpenChange, row }: SmartRepliesSheetProps) {
  const [suggestionSet, setSuggestionSet] = React.useState<any>(null);
  const [draft, setDraft] = React.useState('');
  const [subject, setSubject] = React.useState('Re: ');
  const [label, setLabel] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [sending, setSending] = React.useState(false);

  // Get current user's organization
  const [orgId, setOrgId] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function fetchOrg() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Try to get org_id from profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', user.id)
        .maybeSingle();
      
      if (profile?.org_id) {
        setOrgId(profile.org_id);
      } else {
        // Fallback: get first org membership
        const { data: membership } = await supabase
          .from('org_members')
          .select('org_id')
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (membership?.org_id) {
          setOrgId(membership.org_id);
        }
      }
    }
    fetchOrg();
  }, []);

  // Generate suggestions when sheet opens
  React.useEffect(() => {
    if (open && row && orgId) {
      generateSuggestions();
    }
  }, [open, row, orgId]);

  async function generateSuggestions() {
    if (!row || !orgId) return;

    setLoading(true);
    try {
      const lastMsg = row.meta?.clean_preview || row.meta?.preview || '';
      const payload = {
        org_id: orgId,
        lead_id: row.lead_id,
        campaign_id: row.campaign_id,
        thread_id: row.meta?.thread_id,
        last_message: lastMsg,
        context: `${row.campaign_id ? 'Campaign reply' : 'General outreach'} — cold outreach`,
        sender_name: row.first_name || ''
      };

      const r = await fetch('/api/edge/smart-replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await r.json();
      
      if (data.error) {
        alert(`Failed to generate suggestions: ${data.error}`);
        return;
      }

      setSuggestionSet(data);
      setDraft(data?.suggestions?.[0]?.body || '');
      setLabel(data?.suggestions?.[0]?.label || '');
      
      // Set subject based on the meta subject
      const metaSubject = row.meta?.subject || '';
      setSubject(metaSubject ? `Re: ${metaSubject}`.trim() : 'Re: ');
    } catch (e: any) {
      console.error('Error generating suggestions:', e);
      alert(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  const choose = (s: any) => {
    setDraft(s.body);
    setLabel(s.label);
  };

  async function send() {
    if (!draft || !suggestionSet || !orgId) return;

    setSending(true);
    try {
      await fetch('/api/replies/smart-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suggestion_id: suggestionSet.id,
          org_id: orgId,
          lead_id: row.lead_id,
          campaign_id: row.campaign_id,
          to: row.email,
          subject,
          body: draft,
          label,
          thread_id: row.meta?.thread_id,
          provider: row.meta?.provider || 'gmail',
          reply_to_message_id: row.meta?.reply_to_message_id
        })
      });

      onOpenChange(false);
      
      // Refresh the page or show success message
      window.location.reload();
    } catch (e: any) {
      console.error('Error sending reply:', e);
      alert(`Failed to send reply: ${e.message}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Smart Replies</SheetTitle>
        </SheetHeader>
        {loading ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : suggestionSet?.suggestions?.length ? (
          <div className="space-y-4 py-4">
            <div className="flex flex-wrap gap-2">
              {suggestionSet.suggestions.map((s: any, i: number) => (
                <button
                  key={i}
                  onClick={() => choose(s)}
                  className={`px-3 py-1 text-sm rounded-full border hover:bg-muted ${
                    label === s.label ? 'bg-primary text-primary-foreground border-primary' : ''
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="grid gap-2">
              <Label>Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>

            <div className="grid gap-2">
              <Label>Reply</Label>
              <Textarea rows={8} value={draft} onChange={(e) => setDraft(e.target.value)} />
              <div className="text-xs text-muted-foreground">
                Tip: Personalize the first sentence and confirm a time window.
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={send} disabled={sending}>
                {sending ? 'Sending...' : 'Send'}
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : suggestionSet && suggestionSet.suggestions?.length === 0 ? (
          <div className="py-6 text-muted-foreground">
            No suggestions available. Try again later.
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

