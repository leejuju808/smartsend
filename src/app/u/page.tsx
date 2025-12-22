'use client';
import { useEffect, useState } from 'react';

export default function UnsubPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token || '';
  const [info, setInfo] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { 
    (async () => {
      if (!token) return;
      try {
        const res = await fetch('/api/unsubscribe/resolve?token='+encodeURIComponent(token));
        const j = await res.json();
        setInfo(j);
      } catch (error) {
        console.error('Error resolving token:', error);
        setInfo({ error: 'Failed to load preferences' });
      }
    })(); 
  }, [token]);

  async function doAction(action: 'global'|'sequence') {
    setMsg(null);
    setLoading(true);
    
    try {
      const res = await fetch('/api/unsubscribe/apply', { 
        method: 'POST', 
        headers: { 'Content-Type':'application/json' }, 
        body: JSON.stringify({ token, action }) 
      });
      const j = await res.json();
      
      if (res.ok) {
        setMsg('Your preferences were saved successfully.');
        // Refresh the info to show updated state
        const refreshRes = await fetch('/api/unsubscribe/resolve?token='+encodeURIComponent(token));
        const refreshData = await refreshRes.json();
        setInfo(refreshData);
      } else {
        setMsg(j.error || 'Something went wrong. Please try again.');
      }
    } catch (error) {
      setMsg('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div className="max-w-lg w-full bg-white border rounded-2xl p-6 text-center">
          <div className="text-xl font-semibold text-gray-900 mb-2">Invalid Link</div>
          <div className="text-gray-600">This unsubscribe link is missing or invalid.</div>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div className="max-w-lg w-full bg-white border rounded-2xl p-6 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-gray-600">Loading your preferences...</div>
        </div>
      </div>
    );
  }

  if (info.error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div className="max-w-lg w-full bg-white border rounded-2xl p-6 text-center">
          <div className="text-xl font-semibold text-red-600 mb-2">Error</div>
          <div className="text-gray-600">{info.error}</div>
        </div>
      </div>
    );
  }

  const brand = process.env.NEXT_PUBLIC_UNSUB_PAGE_BRAND || 'SmartSend';
  const isGlobalOptOut = info.global_opt_out;
  const isSequenceOptOut = info.sequence_opt_out;

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="max-w-lg w-full bg-white border rounded-2xl p-6 space-y-6">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">{brand}</div>
          <div className="text-sm text-gray-600 mt-1">Email Preferences Center</div>
        </div>

        <div className="text-center">
          <div className="text-sm text-gray-600 mb-2">Signed in as</div>
          <div className="text-lg font-semibold text-gray-900">{info.email_masked}</div>
        </div>

        {isGlobalOptOut && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
            <div className="text-green-800 font-medium">✓ You're unsubscribed from all emails</div>
            <div className="text-green-600 text-sm mt-1">You won't receive any emails from us</div>
          </div>
        )}

        {info.sequence_id && isSequenceOptOut && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
            <div className="text-blue-800 font-medium">✓ You're opted out of this sequence</div>
            <div className="text-blue-600 text-sm mt-1">You won't receive more emails from this specific sequence</div>
          </div>
        )}

        <div className="space-y-3">
          {!isGlobalOptOut && (
            <button 
              onClick={() => doAction('global')} 
              disabled={loading}
              className="w-full px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Processing...' : 'Unsubscribe from all emails'}
            </button>
          )}
          
          {info.sequence_id && !isSequenceOptOut && (
            <button 
              onClick={() => doAction('sequence')} 
              disabled={loading}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Processing...' : 'Opt out of this sequence only'}
            </button>
          )}
        </div>

        {msg && (
          <div className={`text-sm p-3 rounded-lg ${
            msg.includes('successfully') 
              ? 'bg-green-50 text-green-700 border border-green-200' 
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {msg}
          </div>
        )}

        <div className="text-xs text-gray-500 text-center leading-relaxed">
          <p>You can resubscribe anytime by replying "subscribe" or contacting support.</p>
          <p className="mt-1">Your preferences are automatically saved and applied to all future emails.</p>
        </div>
      </div>
    </div>
  );
} 