'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X } from 'lucide-react';

type ReplyMessage = {
  id: string;
  from_email: string | null;
  subject: string | null;
  snippet: string | null;
  created_at: string;
};

type Lead = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  name?: string;
  subject?: string;
};

interface ReplyModalProps {
  lead: Lead;
  onClose: () => void;
}

export default function ReplyModal({ lead, onClose }: ReplyModalProps) {
  const supabase = createClientComponentClient();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [threadMessages, setThreadMessages] = useState<ReplyMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(true);
  const [subject, setSubject] = useState('');

  // Fetch thread messages from replies table
  useEffect(() => {
    const fetchThread = async () => {
      setLoadingThread(true);
      try {
        const { data, error } = await supabase
          .from('replies')
          .select('id, from_email, subject, snippet, created_at')
          .eq('lead_id', lead.id)
          .order('created_at', { ascending: true });

        if (error) {
          console.error('Error fetching thread:', error);
        } else if (data) {
          setThreadMessages(data);
          // Set subject from the most recent reply
          if (data.length > 0 && data[data.length - 1].subject) {
            const originalSubject = data[data.length - 1].subject;
            // Add "Re:" prefix if not already present
            setSubject(originalSubject.startsWith('Re:') ? originalSubject : `Re: ${originalSubject}`);
          }
        }
      } catch (err) {
        console.error('Failed to fetch thread:', err);
      } finally {
        setLoadingThread(false);
      }
    };

    if (lead.id) {
      fetchThread();
    }
  }, [lead.id, supabase]);

  const handleSend = async () => {
    if (!message.trim()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/sendEmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: lead.email,
          subject: subject || `Re: ${lead.subject || 'Your message'}`,
          body: message,
          lead_id: lead.id,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to send reply');
      }

      // Clear message and refresh thread
      setMessage('');
      
      // Refetch thread to show the new message
      const { data } = await supabase
        .from('replies')
        .select('id, from_email, subject, snippet, created_at')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: true });
      
      if (data) {
        setThreadMessages(data);
      }
    } catch (err: any) {
      console.error('Error sending reply:', err);
      alert(`Failed to send reply: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const leadName = lead.name || `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.email;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl bg-zinc-900 text-white border-zinc-800 max-h-[90vh] flex flex-col">
        <CardHeader className="flex-row items-center justify-between border-b border-zinc-800 pb-4">
          <div className="flex-1">
            <CardTitle className="text-lg font-semibold">{leadName}</CardTitle>
            <p className="text-sm text-zinc-400 mt-1">{lead.email}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </CardHeader>

        <CardContent className="p-4 space-y-4 flex-1 overflow-y-auto">
          {/* Thread Messages */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-300 mb-2">Email Thread</h3>
            {loadingThread ? (
              <p className="text-sm text-zinc-400">Loading thread...</p>
            ) : threadMessages.length === 0 ? (
              <p className="text-sm text-zinc-400">No messages in thread yet.</p>
            ) : (
              threadMessages.map((msg) => (
                <div
                  key={msg.id}
                  className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-2"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{msg.from_email || 'Unknown sender'}</p>
                      <p className="text-xs text-zinc-400 mt-1">
                        {new Date(msg.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  {msg.subject && (
                    <p className="text-sm font-semibold text-zinc-200">{msg.subject}</p>
                  )}
                  {msg.snippet && (
                    <p className="text-sm text-zinc-300 mt-2 whitespace-pre-wrap">
                      {msg.snippet}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Reply Box */}
          <div className="space-y-3 pt-4 border-t border-zinc-800">
            <div>
              <label className="text-sm font-medium text-zinc-300 block mb-2">
                Subject
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                className="w-full p-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-600"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-300 block mb-2">
                Reply
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write your reply..."
                className="w-full h-32 p-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-600 resize-none"
              />
            </div>
            <Button
              disabled={loading || !message.trim()}
              onClick={handleSend}
              className="w-full bg-yellow-500/10 border border-yellow-500/30 hover:bg-yellow-500/20 text-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Sending...' : 'Send Reply'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

